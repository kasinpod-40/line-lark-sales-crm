import type { Env } from "../config/env";
import type { MediaAsset } from "../storage/operational.repository";
import { OperationalRepository } from "../storage/operational.repository";
import { asNumber } from "../utils/json";
import { stableUuid } from "../utils/id";

export interface LarkMediaLocator {
  messageId: string;
  resourceKey: string;
  resourceType: "image" | "file";
}

function safeFileName(value: string): string {
  const cleaned = value.trim().replace(/[\\/\0\r\n]/g, "_").slice(0, 180);
  return cleaned || "download";
}

export function encodeLarkMediaLocator(locator: LarkMediaLocator): string {
  const messageId = locator.messageId.trim();
  const resourceKey = locator.resourceKey.trim();
  if (!messageId || !resourceKey) throw new Error("Lark media locator requires messageId and resourceKey");
  if (locator.resourceType !== "image" && locator.resourceType !== "file") throw new Error("Invalid Lark media resource type");
  return `lark:${locator.resourceType}:${encodeURIComponent(messageId)}:${encodeURIComponent(resourceKey)}`;
}

export function parseLarkMediaLocator(value: string): LarkMediaLocator | null {
  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== "lark" || (parts[1] !== "image" && parts[1] !== "file")) return null;
  try {
    const messageId = decodeURIComponent(parts[2] ?? "").trim();
    const resourceKey = decodeURIComponent(parts[3] ?? "").trim();
    if (!messageId || !resourceKey) return null;
    return { messageId, resourceKey, resourceType: parts[1] };
  } catch {
    return null;
  }
}

export class MediaAssetService {
  private readonly operational: OperationalRepository;

  constructor(private readonly env: Env) {
    this.operational = new OperationalRepository(env);
  }

  publicUrl(token: string): string {
    const base = this.env.PUBLIC_BASE_URL.replace(/\/$/, "");
    if (!base.startsWith("https://")) throw new Error("PUBLIC_BASE_URL must use HTTPS");
    return `${base}/assets/media/${token}`;
  }

  async storeLarkReference(input: {
    caseId: string;
    sourceMessageId: string;
    resourceKey: string;
    resourceType: "image" | "file";
    mediaKind: MediaAsset["media_kind"];
    mimeType: string;
    fileName?: string;
    sizeBytes: number;
  }): Promise<{ asset: MediaAsset; url: string }> {
    if (!input.sourceMessageId.trim()) throw new Error("Lark media source message ID is required");
    if (!input.resourceKey.trim()) throw new Error("Lark media resource key is required");
    if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) throw new Error("Lark media resource size is invalid");

    const ttlSeconds = Math.max(3600, asNumber(this.env.MEDIA_TTL_SECONDS, 604800));
    const token = await stableUuid(`media:lark:${input.sourceMessageId}:${input.resourceKey}:${input.mediaKind}`);
    const fileName = safeFileName(input.fileName || `${input.mediaKind}-${input.sourceMessageId}`);
    const objectKey = encodeLarkMediaLocator({
      messageId: input.sourceMessageId,
      resourceKey: input.resourceKey,
      resourceType: input.resourceType,
    });
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;

    const asset: MediaAsset = {
      token,
      object_key: objectKey,
      case_id: input.caseId,
      source_message_id: input.sourceMessageId,
      media_kind: input.mediaKind,
      mime_type: input.mimeType || "application/octet-stream",
      file_name: fileName,
      size_bytes: input.sizeBytes,
      created_at: now,
      expires_at: expiresAt,
    };
    await this.operational.createMediaAsset(asset);
    return { asset, url: this.publicUrl(token) };
  }
}
