import type { Env } from "../config/env";
import { parseSalesCommand } from "../core/commands";
import { buildCampaignFormCard, buildCloseDealConfirmCard } from "../providers/lark/lark.cards";
import { LarkClient } from "../providers/lark/lark.client";
import { lineText, pushLineMessages } from "../providers/line/line.provider";
import { LarkBaseRepository } from "../storage/lark-base.repository";
import { OperationalRepository } from "../storage/operational.repository";
import { newId, stableUuid } from "../utils/id";

export interface LarkMessageEvent {
  eventId: string;
  messageId: string;
  rootMessageId: string;
  senderOpenId: string;
  senderType: string;
  messageType: string;
  text: string;
  occurredAt: number;
}

export class LarkEventService {
  private readonly operational: OperationalRepository;
  private readonly base: LarkBaseRepository;
  private readonly lark: LarkClient;

  constructor(private readonly env: Env) {
    this.operational = new OperationalRepository(env);
    this.base = new LarkBaseRepository(env);
    this.lark = new LarkClient(env);
  }

  async handleMessage(event: LarkMessageEvent): Promise<void> {
    const eventKey = `lark:${event.eventId || event.messageId}`;
    const acquired = await this.operational.acquireEvent(eventKey, "lark_thread_message");
    if (!acquired) return;

    try {
      // Ignore bot/app echoes. Only real user replies may bridge to LINE.
      if (event.senderType && event.senderType !== "user") {
        await this.operational.completeEvent(eventKey);
        return;
      }

      const route = await this.operational.getCaseByRootMessageId(event.rootMessageId);
      if (!route) {
        await this.operational.completeEvent(eventKey);
        return;
      }

      if (!route.owner_open_id) {
        await this.lark.replyText(event.rootMessageId, "⛔ กรุณากด ‘รับเคสนี้’ ก่อนตอบลูกค้า");
        await this.operational.completeEvent(eventKey);
        return;
      }
      if (route.owner_open_id !== event.senderOpenId) {
        await this.lark.replyText(event.rootMessageId, `⛔ เคสนี้ถูกดูแลโดย ${route.owner_name ?? "Sales คนอื่น"} แล้ว`);
        await this.operational.completeEvent(eventKey);
        return;
      }

      if (event.messageType !== "text" || !event.text.trim()) {
        await this.lark.replyText(event.rootMessageId, "ℹ️ เวอร์ชันแรกส่งกลับ LINE จาก Thread รองรับข้อความ Text ก่อน รูปจากลูกค้ายังเข้ามาแสดงใน Thread ได้ตามปกติ");
        await this.operational.completeEvent(eventKey);
        return;
      }

      const command = parseSalesCommand(event.text);
      if (command.type === "close_deal") {
        const draftId = newId("draft");
        await this.operational.createDraft({
          draft_id: draftId,
          kind: "close_deal",
          case_id: route.case_id,
          created_by: event.senderOpenId,
          payload: { amount: command.amount },
        });
        await this.lark.replyCard(event.rootMessageId, buildCloseDealConfirmCard(route.case_id, draftId, command.amount));
        await this.operational.completeEvent(eventKey);
        return;
      }

      if (command.type === "campaign") {
        await this.lark.replyCard(event.rootMessageId, buildCampaignFormCard(route.case_id, command.segment));
        await this.operational.completeEvent(eventKey);
        return;
      }

      await pushLineMessages(
        this.env,
        route.line_user_id,
        [lineText(event.text)],
        await stableUuid(`line-reply:${event.messageId}`),
      );

      const updatedRoute = await this.operational.markFirstResponse(route.case_id, event.occurredAt || Date.now());
      await this.base.createMessageTracking({
        tracking_id: `lark:${event.messageId}`,
        case_id: route.case_id,
        customer_id: route.customer_id,
        sales_id: route.owner_open_id,
        sales_name: route.owner_name ?? undefined,
        direction: "sales_to_customer",
        message_type: "text",
        message_id: event.messageId,
        message_text: event.text,
        event_at: event.occurredAt || Date.now(),
      });
      await this.base.upsertCaseTracking(updatedRoute);
      await this.operational.completeEvent(eventKey);
    } catch (error) {
      await this.operational.failEvent(eventKey, error).catch(() => undefined);
      throw error;
    }
  }
}
