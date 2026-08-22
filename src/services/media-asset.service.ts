import type { Env } from "../config/env";
import type { MediaAsset } from "../storage/operational.repository";
import { OperationalRepository } from "../storage/operational.repository";
import { asNumber } from "../utils/json";
import { stableUuid } from "../utils/id";

function safeFileName(value: string): string {
  const cleaned = value.trim().replace(/[\\/\0\r\n]/g, "_").slice(0, 180);
  return cleaned || "download";
}

function extensionFromMime(mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "application/pdf") return "pdf";
  if (mime === "audio/mpeg") return "mp3";
  if (mime === "audio/mp4" || mime === "audio/x-m4a") return "m4a";
  if (mime === "audio/ogg") return "ogg";
  if (mime === "audio/opus") return "opus";
  return "bin";
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

  async store(input: {
    caseId: string;
    sourceMessageId: string;
    mediaKind: MediaAsset["media_kind"];
    bytes: ArrayBuffer;
    mimeType: string;
    fileName?: string;
  }): Promise<{ asset: MediaAsset; url: string }> {
    if (input.bytes.byteLength <= 0) throw new Error("Media content is empty");
    const ttlSeconds = Math.max(3600, asNumber(this.env.MEDIA_TTL_SECONDS, 604800));
    const token = await stableUuid(`media:${input.caseId}:${input.sourceMessageId}:${input.mediaKind}`);
    const fileName = safeFileName(input.fileName || `${input.mediaKind}-${input.sourceMessageId}.${extensionFromMime(input.mimeType)}`);
    const objectKey = `case-media/${input.caseId}/${token}/${fileName}`;
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;

    await this.env.MEDIA_BUCKET.put(objectKey, input.bytes, {
      httpMetadata: {
        contentType: input.mimeType || "application/octet-stream",
        contentDisposition: `${input.mediaKind === "file" ? "attachment" : "inline"}; filename="${fileName.replace(/"/g, "")}"`,
        cacheControl: "private, max-age=300",
      },
      customMetadata: {
        case_id: input.caseId,
        source_message_id: input.sourceMessageId,
        media_kind: input.mediaKind,
        expires_at: String(expiresAt),
      },
    });

    const asset: MediaAsset = {
      token,
      object_key: objectKey,
      case_id: input.caseId,
      source_message_id: input.sourceMessageId,
      media_kind: input.mediaKind,
      mime_type: input.mimeType || "application/octet-stream",
      file_name: fileName,
      size_bytes: input.bytes.byteLength,
      created_at: now,
      expires_at: expiresAt,
    };
    await this.operational.createMediaAsset(asset);
    return { asset, url: this.publicUrl(token) };
  }
}
