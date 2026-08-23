import type { Env } from "../../config/env";
import { verifyLineWebhookSignature } from "../../providers/line/line.provider";
import type { LineEventQueueMessage, LineQueueMessageType, LineSourceType } from "../../queues/line-event.types";
import { enqueueLineEvent } from "../../queues/line-event.producer";
import { asNumber, asString, isRecord } from "../../utils/json";
import { jsonResponse } from "../../utils/response";

const supportedTypes = new Set<LineQueueMessageType>(["text", "image", "sticker", "audio", "file", "location"]);

function parseSupportedMessageEvent(destination: string, event: unknown): LineEventQueueMessage | null {
  if (!isRecord(event) || event.type !== "message" || !isRecord(event.source) || !isRecord(event.message)) return null;
  const source = event.source;
  const message = event.message;
  const userId = asString(source.userId).trim();
  const messageId = asString(message.id).trim();
  const sourceType = asString(source.type) as LineSourceType;
  const messageType = asString(message.type) as LineQueueMessageType;
  if (!userId || !messageId || sourceType !== "user" || !supportedTypes.has(messageType)) return null;

  const deliveryContext = isRecord(event.deliveryContext) ? event.deliveryContext : {};
  const contentProvider = isRecord(message.contentProvider) ? message.contentProvider : {};
  const latitude = typeof message.latitude === "number" ? message.latitude : undefined;
  const longitude = typeof message.longitude === "number" ? message.longitude : undefined;

  return {
    schema_version: 1,
    channel: "LINE",
    webhook_event_id: asString(event.webhookEventId).trim() || `line-webhook-${messageId}`,
    destination,
    is_redelivery: deliveryContext.isRedelivery === true,
    occurred_at: asNumber(event.timestamp, Date.now()),
    source_type: sourceType,
    user_id: userId,
    group_id: asString(source.groupId).trim() || undefined,
    room_id: asString(source.roomId).trim() || undefined,
    message: {
      id: messageId,
      type: messageType,
      text: asString(message.text).trim() || undefined,
      package_id: asString(message.packageId).trim() || undefined,
      sticker_id: asString(message.stickerId).trim() || undefined,
      content_provider_type: isRecord(message.contentProvider) ? (contentProvider.type === "external" ? "external" : "line") : undefined,
      original_content_url: asString(contentProvider.originalContentUrl).trim() || undefined,
      preview_image_url: asString(contentProvider.previewImageUrl).trim() || undefined,
      file_name: asString(message.fileName).trim() || undefined,
      file_size: typeof message.fileSize === "number" ? message.fileSize : undefined,
      duration_ms: typeof message.duration === "number" ? message.duration : undefined,
      title: asString(message.title).trim() || undefined,
      address: asString(message.address).trim() || undefined,
      latitude,
      longitude,
    },
  };
}

export async function handleLineWebhook(request: Request, env: Env): Promise<Response> {
  const startedAt = Date.now();
  if (request.method !== "POST") return jsonResponse({ ok: false, message: "Method not allowed" }, 405);
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature") ?? "";
  if (!(await verifyLineWebhookSignature(rawBody, signature, env.LINE_CHANNEL_SECRET))) return jsonResponse({ ok: false, message: "Invalid LINE signature" }, 401);
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return jsonResponse({ ok: false, message: "Invalid JSON" }, 400); }
  if (!isRecord(body)) return jsonResponse({ ok: false, message: "Invalid webhook body" }, 400);
  const events = Array.isArray(body.events) ? body.events : [];
  const destination = asString(body.destination).trim();
  const messages = events.map((event) => parseSupportedMessageEvent(destination, event)).filter((event): event is LineEventQueueMessage => event !== null);
  const queueStartedAt = Date.now();
  try {
    await Promise.all(messages.map((event) => enqueueLineEvent(env, event)));
  } catch (error) {
    console.error("LINE_WEBHOOK_QUEUE_SEND_FAILED", JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      enqueued_events: messages.length,
      queue_ms: Date.now() - queueStartedAt,
      total_ms: Date.now() - startedAt,
    }));
    return jsonResponse({ ok: false, message: "Queue unavailable" }, 503);
  }

  const timing = {
    received_events: events.length,
    enqueued_events: messages.length,
    redelivery_events: messages.filter((event) => event.is_redelivery).length,
    queue_ms: Date.now() - queueStartedAt,
    total_ms: Date.now() - startedAt,
  };
  if (timing.total_ms > 1500) console.warn("LINE_WEBHOOK_SLOW", JSON.stringify(timing));
  else console.log("LINE_WEBHOOK_ENQUEUED", JSON.stringify(timing));

  return jsonResponse({ ok: true, received_events: events.length, enqueued_events: messages.length });
}
