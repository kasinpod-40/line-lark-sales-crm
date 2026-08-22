import type { Env } from "../../config/env";
import type { WorkerExecutionContext } from "../../platform/cloudflare";
import { CardActionService, type CardActionEvent } from "../../services/card-action.service";
import { LarkEventService, type LarkMessageEvent } from "../../services/lark-event.service";
import { decryptLarkPayload } from "../../providers/lark/lark.client";
import { asNumber, asString, isRecord, parseJsonRecord, type UnknownRecord } from "../../utils/json";
import { jsonResponse } from "../../utils/response";

function objectValue(value: unknown): UnknownRecord {
  if (isRecord(value)) return value;
  if (typeof value === "string") return parseJsonRecord(value) ?? {};
  return {};
}

async function parseBody(rawText: string, env: Env): Promise<UnknownRecord> {
  const initial = parseJsonRecord(rawText);
  if (!initial) throw new Error("Invalid Lark callback JSON");
  const encrypted = asString(initial.encrypt);
  if (!encrypted) return initial;
  const decrypted = await decryptLarkPayload(env, encrypted);
  const parsed = parseJsonRecord(decrypted);
  if (!parsed) throw new Error("Invalid decrypted Lark callback JSON");
  return parsed;
}

function verificationToken(body: UnknownRecord): string {
  if (isRecord(body.header)) return asString(body.header.token) || asString(body.token);
  return asString(body.token);
}

function parseMessageEvent(body: UnknownRecord): LarkMessageEvent | null {
  if (!isRecord(body.header) || !isRecord(body.event) || !isRecord(body.event.message) || !isRecord(body.event.sender)) return null;
  const header = body.header as UnknownRecord;
  const event = body.event as UnknownRecord;
  const message = event.message as UnknownRecord;
  const sender = event.sender as UnknownRecord;
  const senderId = isRecord(sender.sender_id) ? sender.sender_id : {};
  const content = parseJsonRecord(asString(message.content)) ?? {};
  const messageId = asString(message.message_id);
  if (!messageId) return null;
  const rootMessageId = asString(message.root_id) || asString(message.parent_id) || null;
  const createTime = asNumber(message.create_time, asNumber(header.create_time, Date.now()));
  return {
    eventId: asString(header.event_id) || `evt-${messageId}`,
    messageId,
    rootMessageId,
    chatId: asString(message.chat_id),
    senderOpenId: asString(senderId.open_id),
    senderType: asString(sender.sender_type),
    messageType: asString(message.message_type),
    text: asString(content.text),
    content,
    occurredAt: createTime < 10_000_000_000 ? createTime * 1000 : createTime,
  };
}

function parseActionEvent(body: UnknownRecord): CardActionEvent | null {
  if (!isRecord(body.header) || !isRecord(body.event)) return null;
  const event = body.event;
  const action = isRecord(event.action) ? event.action : isRecord(body.action) ? body.action : {};
  const operator = isRecord(event.operator) ? event.operator : {};
  const operatorId = isRecord(operator.operator_id) ? operator.operator_id : {};

  // Card 2.0 callback behavior values are surfaced as the button action value.
  // Some delivery adapters expose the same value as a JSON string in
  // action_value, so support both representations without weakening validation.
  const value = objectValue(action.value ?? action.action_value ?? event.action_value);
  const formValue = objectValue(action.form_value ?? event.form_value);
  const actionName = asString(value.action) || asString(action.name) || asString(action.tag);
  const openId = asString(operatorId.open_id) || asString(operator.open_id);
  if (!actionName || !openId) return null;

  return {
    eventId: asString(body.header.event_id) || crypto.randomUUID(),
    operatorOpenId: openId,
    action: actionName,
    value,
    formValue,
  };
}

export async function handleLarkWebhook(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ ok: false, message: "Method not allowed" }, 405);
  let body: UnknownRecord;
  try { body = await parseBody(await request.text(), env); }
  catch (error) { return jsonResponse({ ok: false, message: error instanceof Error ? error.message : String(error) }, 400); }

  // Lark URL verification is a time-sensitive ownership handshake. The platform
  // requires the received challenge to be echoed within one second. Do not put
  // the handshake behind runtime event-token validation; real event/card pushes
  // below remain protected by LARK_VERIFICATION_TOKEN.
  const challenge = asString(body.challenge);
  if (challenge) return jsonResponse({ challenge });

  const configuredToken = env.LARK_VERIFICATION_TOKEN?.trim();
  if (configuredToken) {
    const received = verificationToken(body);
    if (!received || received !== configuredToken) return jsonResponse({ ok: false, message: "Invalid Lark verification token" }, 401);
  }

  const eventType = isRecord(body.header) ? asString(body.header.event_type) : asString(body.type);
  if (eventType === "im.message.receive_v1") {
    const event = parseMessageEvent(body);
    if (event) ctx.waitUntil(new LarkEventService(env).handleMessage(event).catch((error) => console.error("LARK_MESSAGE_EVENT_FAILED", error)));
    return jsonResponse({ code: 0 });
  }
  if (eventType === "card.action.trigger" || isRecord(body.event) && isRecord(body.event.action)) {
    const event = parseActionEvent(body);
    if (event) ctx.waitUntil(new CardActionService(env).handle(event).catch((error) => console.error("LARK_CARD_ACTION_FAILED", error)));
    // Acknowledge immediately; Base/LINE mutations continue asynchronously.
    return jsonResponse({ toast: { type: "info", content: "กำลังดำเนินการ..." } });
  }
  return jsonResponse({ code: 0 });
}
