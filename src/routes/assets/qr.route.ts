import type { Env } from "../../config/env";
import { OperationalRepository } from "../../storage/operational.repository";
import { textResponse } from "../../utils/response";

export async function handleQrAsset(request: Request, env: Env, token: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return textResponse("Method not allowed", 405);
  if (!/^[0-9a-f-]{36}$/i.test(token)) return textResponse("Not found", 404);
  const asset = await new OperationalRepository(env).getQrAsset(token);
  if (!asset) return textResponse("QR expired or not found", 404);

  // `qrcode` is CommonJS. Node may expose `toBuffer` as a synthetic named export,
  // while the Cloudflare Worker bundle can expose the CommonJS object only under
  // `default`. Normalize both interop shapes before rendering the PNG.
  const qrModule = await import("qrcode");
  const qrEncoder = typeof qrModule.toBuffer === "function" ? qrModule : qrModule.default;
  if (!qrEncoder || typeof qrEncoder.toBuffer !== "function") {
    throw new Error("QR encoder does not expose toBuffer in this runtime");
  }
  const png = await qrEncoder.toBuffer(asset.promptpay_payload, {
    type: "png",
    width: 1024,
    margin: 4,
    errorCorrectionLevel: "M",
  });
  const headers = {
    "content-type": "image/png",
    "content-length": String(png.byteLength),
    "cache-control": "public, max-age=3600",
    "content-disposition": `inline; filename="promptpay-${token}.png"`,
    "x-content-type-options": "nosniff",
  };
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });

  const body = new ArrayBuffer(png.byteLength);
  new Uint8Array(body).set(png);
  return new Response(body, { status: 200, headers });
}
