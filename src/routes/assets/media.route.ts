import type { Env } from "../../config/env";
import { LarkClient } from "../../providers/lark/lark.client";
import { parseLarkMediaLocator } from "../../services/media-asset.service";
import { OperationalRepository } from "../../storage/operational.repository";
import { textResponse } from "../../utils/response";

export async function handleMediaAsset(request: Request, env: Env, token: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return textResponse("Method not allowed", 405);
  if (!/^[0-9a-f-]{36}$/i.test(token)) return textResponse("Not found", 404);

  const asset = await new OperationalRepository(env).getMediaAsset(token);
  if (!asset) return textResponse("Media expired or not found", 404);

  const locator = parseLarkMediaLocator(asset.object_key);
  if (!locator || locator.messageId !== asset.source_message_id) return textResponse("Media reference unavailable", 410);

  const headers = new Headers();
  headers.set("content-type", asset.mime_type || "application/octet-stream");
  headers.set("content-length", String(asset.size_bytes));
  headers.set("x-content-type-options", "nosniff");
  headers.set("cache-control", "private, max-age=300");
  headers.set("content-disposition", `${asset.media_kind === "file" ? "attachment" : "inline"}; filename="${asset.file_name.replace(/"/g, "")}"`);

  if (request.method === "HEAD") return new Response(null, { status: 200, headers });

  try {
    const resource = await new LarkClient(env).downloadMessageResource(locator.messageId, locator.resourceKey, locator.resourceType);
    headers.set("content-type", resource.mime_type || asset.mime_type || "application/octet-stream");
    headers.set("content-length", String(resource.size_bytes));
    return new Response(resource.bytes, { status: 200, headers });
  } catch (error) {
    console.warn("LARK_MEDIA_PROXY_FETCH_FAILED", token, error instanceof Error ? error.message : String(error));
    return textResponse("Media expired or unavailable", 404);
  }
}
