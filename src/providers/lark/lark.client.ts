import type { Env } from "../../config/env";
import { asString, isRecord } from "../../utils/json";

let cachedToken: { value: string; expiresAt: number } | null = null;
const DEFAULT_RESOURCE_LIMIT = 25 * 1024 * 1024;

export interface LarkDownloadedResource {
  bytes: ArrayBuffer;
  mime_type: string;
  file_name?: string;
  size_bytes: number;
}

export class LarkResourceTooLargeError extends Error {
  constructor(public readonly max_bytes: number) {
    super(`Lark resource exceeds bridge memory limit (${Math.round(max_bytes / 1024 / 1024)} MB)`);
    this.name = "LarkResourceTooLargeError";
  }
}

async function tenantAccessToken(env: Env): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - now > 60_000) return cachedToken.value;
  const response = await fetch("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app_id: env.LARK_APP_ID, app_secret: env.LARK_APP_SECRET }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Lark tenant token failed: ${response.status} ${text.slice(0, 800)}`);
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error("Invalid Lark tenant token response");
  const token = asString(parsed.tenant_access_token);
  if (!token) throw new Error(`Lark tenant token missing: ${text.slice(0, 800)}`);
  const expireSeconds = typeof parsed.expire === "number" ? parsed.expire : 7200;
  cachedToken = { value: token, expiresAt: now + expireSeconds * 1000 };
  return token;
}

async function larkFetch(env: Env, path: string, init: RequestInit = {}): Promise<unknown> {
  const token = await tenantAccessToken(env);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(`https://open.larksuite.com${path}`, { ...init, headers });
  const text = await response.text();
  let parsed: unknown = text;
  try { parsed = text ? JSON.parse(text) : {}; } catch { /* preserve text */ }
  if (!response.ok) throw new Error(`Lark API ${path} failed: ${response.status} ${text.slice(0, 1000)}`);
  if (isRecord(parsed) && typeof parsed.code === "number" && parsed.code !== 0) {
    throw new Error(`Lark API ${path} error ${parsed.code}: ${asString(parsed.msg) || text.slice(0, 800)}`);
  }
  return parsed;
}

async function larkBinaryFetch(env: Env, path: string): Promise<Response> {
  const token = await tenantAccessToken(env);
  const response = await fetch(`https://open.larksuite.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lark resource ${path} failed: ${response.status} ${text.slice(0, 1000)}`);
  }
  return response;
}

async function readResponseWithLimit(response: Response, maxBytes: number): Promise<ArrayBuffer> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new LarkResourceTooLargeError(maxBytes);
  if (!response.body) return new ArrayBuffer(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("bridge content limit exceeded").catch(() => undefined);
        throw new LarkResourceTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

function extractMessageId(response: unknown): string {
  if (!isRecord(response) || !isRecord(response.data)) return "";
  if (isRecord(response.data.message)) return asString(response.data.message.message_id);
  return asString(response.data.message_id);
}

function dispositionFileName(value: string | null): string | undefined {
  if (!value) return undefined;
  const utf = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf) {
    try { return decodeURIComponent(utf.replace(/^"|"$/g, "")); } catch { return utf; }
  }
  const plain = value.match(/filename="?([^";]+)"?/i)?.[1];
  return plain?.trim() || undefined;
}

function larkFileType(fileName: string, mimeType: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".opus") || mimeType === "audio/opus") return "opus";
  if (lower.endsWith(".mp4") || mimeType === "video/mp4") return "mp4";
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (lower.endsWith(".doc")) return "doc";
  if (lower.endsWith(".xls")) return "xls";
  if (lower.endsWith(".ppt")) return "ppt";
  return "stream";
}

export class LarkClient {
  constructor(private readonly env: Env) {}

  async sendCard(chatId: string, card: unknown, uuid?: string): Promise<string> {
    const response = await larkFetch(this.env, "/open-apis/im/v1/messages?receive_id_type=chat_id", {
      method: "POST",
      body: JSON.stringify({ receive_id: chatId, msg_type: "interactive", content: JSON.stringify(card), ...(uuid ? { uuid } : {}) }),
    });
    const messageId = extractMessageId(response);
    if (!messageId) throw new Error("Lark sendCard returned no message_id");
    return messageId;
  }

  async replyCard(rootMessageId: string, card: unknown): Promise<string> {
    const response = await larkFetch(this.env, `/open-apis/im/v1/messages/${encodeURIComponent(rootMessageId)}/reply`, {
      method: "POST",
      body: JSON.stringify({ msg_type: "interactive", content: JSON.stringify(card), reply_in_thread: true }),
    });
    return extractMessageId(response);
  }

  async replyText(rootMessageId: string, text: string): Promise<string> {
    const response = await larkFetch(this.env, `/open-apis/im/v1/messages/${encodeURIComponent(rootMessageId)}/reply`, {
      method: "POST",
      body: JSON.stringify({ msg_type: "text", content: JSON.stringify({ text: text.slice(0, 10000) }), reply_in_thread: true }),
    });
    return extractMessageId(response);
  }

  async replyImage(rootMessageId: string, imageKey: string): Promise<string> {
    const response = await larkFetch(this.env, `/open-apis/im/v1/messages/${encodeURIComponent(rootMessageId)}/reply`, {
      method: "POST",
      body: JSON.stringify({ msg_type: "image", content: JSON.stringify({ image_key: imageKey }), reply_in_thread: true }),
    });
    return extractMessageId(response);
  }

  async replyFile(rootMessageId: string, fileKey: string): Promise<string> {
    const response = await larkFetch(this.env, `/open-apis/im/v1/messages/${encodeURIComponent(rootMessageId)}/reply`, {
      method: "POST",
      body: JSON.stringify({ msg_type: "file", content: JSON.stringify({ file_key: fileKey }), reply_in_thread: true }),
    });
    return extractMessageId(response);
  }

  async patchCard(messageId: string, card: unknown): Promise<void> {
    await larkFetch(this.env, `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      body: JSON.stringify({ content: JSON.stringify(card) }),
    });
  }

  async uploadMessageImage(bytes: ArrayBuffer, mimeType: string, fileName: string): Promise<string> {
    const form = new FormData();
    form.set("image_type", "message");
    form.set("image", new Blob([bytes], { type: mimeType }), fileName);
    const response = await larkFetch(this.env, "/open-apis/im/v1/images", { method: "POST", body: form });
    if (!isRecord(response) || !isRecord(response.data)) throw new Error("Lark image upload returned invalid response");
    const key = asString(response.data.image_key);
    if (!key) throw new Error("Lark image upload returned no image_key");
    return key;
  }

  async uploadMessageFile(bytes: ArrayBuffer, mimeType: string, fileName: string, durationMs?: number): Promise<string> {
    if (bytes.byteLength <= 0) throw new Error("Lark file upload is empty");
    if (bytes.byteLength > 30 * 1024 * 1024) throw new Error("Lark message file upload exceeds 30 MB");
    const form = new FormData();
    form.set("file_type", larkFileType(fileName, mimeType));
    form.set("file_name", fileName);
    if (durationMs && durationMs > 0) form.set("duration", String(Math.round(durationMs)));
    form.set("file", new Blob([bytes], { type: mimeType || "application/octet-stream" }), fileName);
    const response = await larkFetch(this.env, "/open-apis/im/v1/files", { method: "POST", body: form });
    if (!isRecord(response) || !isRecord(response.data)) throw new Error("Lark file upload returned invalid response");
    const key = asString(response.data.file_key);
    if (!key) throw new Error("Lark file upload returned no file_key");
    return key;
  }

  async downloadMessageResource(
    messageId: string,
    fileKey: string,
    resourceType: "image" | "file",
    maxBytes = DEFAULT_RESOURCE_LIMIT,
  ): Promise<LarkDownloadedResource> {
    const response = await larkBinaryFetch(
      this.env,
      `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/resources/${encodeURIComponent(fileKey)}?type=${resourceType}`,
    );
    const bytes = await readResponseWithLimit(response, Math.max(1024, maxBytes));
    if (bytes.byteLength <= 0) throw new Error("Lark message resource is empty");
    return {
      bytes,
      mime_type: response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream",
      file_name: dispositionFileName(response.headers.get("content-disposition")),
      size_bytes: bytes.byteLength,
    };
  }

  async getUserDisplayName(openId: string): Promise<string> {
    try {
      const response = await larkFetch(this.env, `/open-apis/contact/v3/users/${encodeURIComponent(openId)}?user_id_type=open_id`, { method: "GET" });
      if (isRecord(response) && isRecord(response.data) && isRecord(response.data.user)) {
        return asString(response.data.user.name).trim() || `Sales ${openId.slice(-6)}`;
      }
    } catch (error) {
      console.warn("LARK_USER_NAME_FALLBACK", error instanceof Error ? error.message : String(error));
    }
    return `Sales ${openId.slice(-6)}`;
  }
}

export async function decryptLarkPayload(env: Env, encrypted: string): Promise<string> {
  if (!env.LARK_ENCRYPT_KEY?.trim()) throw new Error("LARK_ENCRYPT_KEY is required for encrypted callbacks");
  const sdk = await import("@larksuiteoapi/node-sdk");
  const cipher = new sdk.AESCipher(env.LARK_ENCRYPT_KEY.trim());
  return await Promise.resolve(cipher.decrypt(encrypted));
}
