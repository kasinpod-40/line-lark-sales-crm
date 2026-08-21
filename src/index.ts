import type { Env } from "./config/env";
import type { QueueBatch, WorkerExecutionContext } from "./platform/cloudflare";
import type { LineEventQueueMessage } from "./queues/line-event.types";
import { handleLineQueueBatch } from "./queues/line-event.consumer";
import { handleLineWebhook } from "./routes/line/webhook.route";
import { handleLarkWebhook } from "./routes/lark/webhook.route";
import { handleQrAsset } from "./routes/assets/qr.route";
import { handleHealth } from "./routes/health.route";
import { jsonResponse } from "./utils/response";

const worker = {
  async fetch(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return handleHealth(env);
    if (url.pathname === "/webhooks/line") return handleLineWebhook(request, env);
    if (url.pathname === "/webhooks/lark") return handleLarkWebhook(request, env, ctx);
    const qrMatch = url.pathname.match(/^\/assets\/qr\/([0-9a-f-]{36})\.png$/i);
    if (qrMatch?.[1]) return handleQrAsset(request, env, qrMatch[1]);
    return jsonResponse({ ok: false, message: "Not found" }, 404);
  },

  async queue(batch: QueueBatch<LineEventQueueMessage>, env: Env, _ctx: WorkerExecutionContext): Promise<void> {
    await handleLineQueueBatch(batch, env);
  },
};

export default worker;
