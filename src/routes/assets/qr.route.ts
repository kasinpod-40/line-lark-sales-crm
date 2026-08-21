import type { Env } from "../../config/env";
import { OperationalRepository } from "../../storage/operational.repository";
import { textResponse } from "../../utils/response";

export async function handleQrAsset(request: Request, env: Env, token: string): Promise<Response> {
  if (request.method !== "GET") return textResponse("Method not allowed", 405);
  if (!/^[0-9a-f-]{36}$/i.test(token)) return textResponse("Not found", 404);
  const asset = await new OperationalRepository(env).getQrAsset(token);
  if (!asset) return textResponse("QR expired or not found", 404);
  const qr = await import("qrcode");
  const png = await qr.toBuffer(asset.promptpay_payload, { type: "png", width: 1024, margin: 4, errorCorrectionLevel: "M" });
  const body = new Blob([png], { type: "image/png" });
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600",
      "content-disposition": `inline; filename="promptpay-${token}.png"`,
    },
  });
}
