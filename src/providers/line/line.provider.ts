import type { Env } from "../../config/env";
import { isRecord, asString } from "../../utils/json";

export type LineUserProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
  language?: string;
};

export type DownloadedLineContent = {
  bytes: ArrayBuffer;
  mime_type: string;
  size_bytes: number;
};

export interface LineTextMessage { type: "text"; text: string; }
export interface LineFlexMessage { type: "flex"; altText: string; contents: unknown; }
export interface LineImageMessage { type: "image"; originalContentUrl: string; previewImageUrl: string; }
export type LineOutboundMessage = LineTextMessage | LineFlexMessage | LineImageMessage;

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

export async function verifyLineWebhookSignature(rawBody: string, receivedSignature: string, channelSecret: string): Promise<boolean> {
  const signature = receivedSignature.trim();
  const secret = channelSecret.trim();
  if (!signature || !secret) return false;
  let receivedBytes: Uint8Array;
  try { receivedBytes = base64ToBytes(signature); } catch { return false; }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return constantTimeEqual(new Uint8Array(digest), receivedBytes);
}

function accessToken(env: Env): string {
  const token = env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");
  return token;
}

export async function getLineUserProfile(env: Env, userId: string): Promise<LineUserProfile | null> {
  const response = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, { headers: { Authorization: `Bearer ${accessToken(env)}` } });
  if (response.status === 404) return null;
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`LINE profile error: ${response.status} ${bodyText.slice(0, 500)}`);
  const parsed: unknown = JSON.parse(bodyText);
  if (!isRecord(parsed)) return null;
  return {
    userId: asString(parsed.userId) || userId,
    displayName: asString(parsed.displayName) || `LINE User ${userId.slice(-6)}`,
    pictureUrl: asString(parsed.pictureUrl) || undefined,
    statusMessage: asString(parsed.statusMessage) || undefined,
    language: asString(parsed.language) || undefined,
  };
}

export async function downloadLineMessageContent(env: Env, messageId: string): Promise<DownloadedLineContent> {
  const response = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, { headers: { Authorization: `Bearer ${accessToken(env)}` } });
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`LINE content error: ${response.status} ${bodyText.slice(0, 500)}`);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0) throw new Error("LINE content is empty");
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  return { bytes, mime_type: mimeType, size_bytes: bytes.byteLength };
}

export async function downloadExternalContent(url: string): Promise<DownloadedLineContent> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("External LINE content URL must use HTTPS");
  const response = await fetch(parsed.toString(), { redirect: "follow" });
  if (!response.ok) throw new Error(`External content error: ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error("External content is empty");
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  return { bytes, mime_type: mimeType, size_bytes: bytes.byteLength };
}

async function linePost(env: Env, path: string, body: unknown, retryKey?: string): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken(env)}`,
    "content-type": "application/json",
  };
  if (retryKey) headers["X-Line-Retry-Key"] = retryKey;
  const response = await fetch(`https://api.line.me${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LINE API ${path} failed: ${response.status} ${text.slice(0, 800)}`);
  }
}

export async function pushLineMessages(env: Env, userId: string, messages: LineOutboundMessage[], retryKey?: string): Promise<void> {
  if (!userId.trim()) throw new Error("LINE user ID is required");
  if (messages.length === 0 || messages.length > 5) throw new Error("LINE push supports 1-5 messages per request");
  await linePost(env, "/v2/bot/message/push", { to: userId, messages }, retryKey);
}

export async function multicastLineMessages(env: Env, userIds: string[], messages: LineOutboundMessage[], retryKey?: string): Promise<void> {
  if (userIds.length === 0 || userIds.length > 500) throw new Error("LINE multicast supports 1-500 user IDs per request");
  if (messages.length === 0 || messages.length > 5) throw new Error("LINE multicast supports 1-5 messages per request");
  await linePost(env, "/v2/bot/message/multicast", { to: userIds, messages }, retryKey);
}

export function lineText(text: string): LineTextMessage {
  return { type: "text", text: text.slice(0, 5000) };
}
