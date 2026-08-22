import type { Env } from "../../config/env";
import { OperationalRepository } from "../../storage/operational.repository";
import { textResponse } from "../../utils/response";

export async function handleMediaAsset(request: Request, env: Env, token: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return textResponse("Method not allowed", 405);
  if (!/^[0-9a-f-]{36}$/i.test(token)) return textResponse("Not found", 404);

  const asset = await new OperationalRepository(env).getMediaAsset(token);
  if (!asset) return textResponse("Media expired or not found", 404);

  const object = await env.MEDIA_BUCKET.get(asset.object_key);
  if (!object) return textResponse("Media object not found", 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", asset.mime_type || headers.get("content-type") || "application/octet-stream");
  headers.set("content-length", String(asset.size_bytes));
  headers.set("etag", object.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  headers.set("cache-control", "private, max-age=300");
  headers.set("content-disposition", `${asset.media_kind === "file" ? "attachment" : "inline"}; filename="${asset.file_name.replace(/"/g, "")}"`);

  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
}
