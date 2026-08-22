import type { Env } from "../config/env";
import { parseSalesCommand } from "../core/commands";
import {
  buildCampaignFormCard,
  buildCampaignSegmentMenuCard,
  buildCloseDealConfirmCard,
  buildThreadGuardWarningCard,
} from "../providers/lark/lark.cards";
import { LarkClient, LarkResourceTooLargeError } from "../providers/lark/lark.client";
import {
  lineText,
  pushLineMessages,
  type LineAudioMessage,
  type LineImageMessage,
  type LineLocationMessage,
} from "../providers/line/line.provider";
import { LarkBaseRepository } from "../storage/lark-base.repository";
import { OperationalRepository } from "../storage/operational.repository";
import { MediaAssetService } from "./media-asset.service";
import { asNumber, asString, type UnknownRecord } from "../utils/json";
import { newId, stableUuid } from "../utils/id";

export interface LarkMessageEvent {
  eventId: string;
  messageId: string;
  rootMessageId: string | null;
  chatId: string;
  senderOpenId: string;
  senderType: string;
  messageType: string;
  text: string;
  content: UnknownRecord;
  occurredAt: number;
}

function resourceKey(event: LarkMessageEvent): string {
  if (event.messageType === "image") return asString(event.content.image_key).trim();
  return asString(event.content.file_key).trim();
}

function messageSummary(event: LarkMessageEvent, responderName: string): string {
  if (event.messageType === "text") return event.text;
  if (event.messageType === "image") return `${responderName} ส่งรูปภาพ`;
  if (event.messageType === "file") return `${responderName} ส่งไฟล์ ${asString(event.content.file_name, "attachment")}`;
  if (event.messageType === "audio") return `${responderName} ส่งไฟล์เสียง`;
  if (event.messageType === "location") return `${responderName} ส่งพิกัด ${asString(event.content.name) || asString(event.content.address)}`.trim();
  if (event.messageType === "sticker") return `${responderName} ส่งสติกเกอร์`;
  return `${responderName} ส่ง ${event.messageType}`;
}

export class LarkEventService {
  private readonly operational: OperationalRepository;
  private readonly base: LarkBaseRepository;
  private readonly lark: LarkClient;
  private readonly media: MediaAssetService;

  constructor(private readonly env: Env) {
    this.operational = new OperationalRepository(env);
    this.base = new LarkBaseRepository(env);
    this.lark = new LarkClient(env);
    this.media = new MediaAssetService(env);
  }

  private async sendMediaToLine(event: LarkMessageEvent, caseId: string, lineUserId: string): Promise<void> {
    if (event.messageType === "image") {
      const key = resourceKey(event);
      if (!key) throw new Error("Lark image message missing image_key");
      const resource = await this.lark.downloadMessageResource(event.messageId, key, "image");
      const stored = await this.media.storeLarkReference({
        caseId,
        sourceMessageId: event.messageId,
        resourceKey: key,
        resourceType: "image",
        mediaKind: "image",
        mimeType: resource.mime_type,
        fileName: resource.file_name || `lark-${event.messageId}.jpg`,
        sizeBytes: resource.size_bytes,
      });
      if (["image/jpeg", "image/png"].includes(resource.mime_type) && resource.size_bytes <= 1024 * 1024) {
        const message: LineImageMessage = { type: "image", originalContentUrl: stored.url, previewImageUrl: stored.url };
        await pushLineMessages(this.env, lineUserId, [message], await stableUuid(`line-media:${event.messageId}`));
      } else {
        await pushLineMessages(this.env, lineUserId, [lineText(`🖼 รูปภาพจากทีมงาน\n${stored.url}`)], await stableUuid(`line-media:${event.messageId}`));
      }
      return;
    }

    if (event.messageType === "file" || event.messageType === "audio") {
      const key = resourceKey(event);
      if (!key) throw new Error(`Lark ${event.messageType} message missing file_key`);
      const resource = await this.lark.downloadMessageResource(event.messageId, key, "file");
      const fileName = asString(event.content.file_name).trim() || resource.file_name || `${event.messageType}-${event.messageId}`;
      const stored = await this.media.storeLarkReference({
        caseId,
        sourceMessageId: event.messageId,
        resourceKey: key,
        resourceType: "file",
        mediaKind: event.messageType === "audio" ? "audio" : "file",
        mimeType: resource.mime_type,
        fileName,
        sizeBytes: resource.size_bytes,
      });
      const duration = Math.max(0, asNumber(event.content.duration, 0));
      const lineAudioCompatible = event.messageType === "audio"
        && duration > 0
        && ["audio/mpeg", "audio/mp4", "audio/x-m4a"].includes(resource.mime_type);
      if (lineAudioCompatible) {
        const message: LineAudioMessage = { type: "audio", originalContentUrl: stored.url, duration };
        await pushLineMessages(this.env, lineUserId, [message], await stableUuid(`line-media:${event.messageId}`));
      } else {
        const prefix = event.messageType === "audio" ? "🎧 ไฟล์เสียง" : "📎 ไฟล์";
        await pushLineMessages(this.env, lineUserId, [lineText(`${prefix}: ${fileName}\n${stored.url}`)], await stableUuid(`line-media:${event.messageId}`));
      }
      return;
    }

    if (event.messageType === "location") {
      const latitude = asNumber(event.content.latitude, Number.NaN);
      const longitude = asNumber(event.content.longitude, Number.NaN);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Lark location missing latitude/longitude");
      const message: LineLocationMessage = {
        type: "location",
        title: (asString(event.content.name) || asString(event.content.title) || "ตำแหน่งจากทีมงาน").slice(0, 100),
        address: (asString(event.content.address) || `${latitude}, ${longitude}`).slice(0, 100),
        latitude,
        longitude,
      };
      await pushLineMessages(this.env, lineUserId, [message], await stableUuid(`line-location:${event.messageId}`));
      return;
    }

    if (event.messageType === "sticker") {
      // Lark and LINE sticker identifiers/resources are not interoperable.
      await pushLineMessages(this.env, lineUserId, [lineText("🧩 ทีมงานส่งสติกเกอร์ใน Lark")], await stableUuid(`line-sticker:${event.messageId}`));
      return;
    }

    throw new Error(`ไม่รองรับการส่ง ${event.messageType} จาก Lark ไป LINE`);
  }

  async handleMessage(event: LarkMessageEvent): Promise<void> {
    const eventKey = `lark:${event.eventId || event.messageId}`;
    const acquired = await this.operational.acquireEvent(eventKey, "lark_message");
    if (!acquired) return;

    try {
      if (event.senderType && event.senderType !== "user") {
        await this.operational.completeEvent(eventKey);
        return;
      }

      if (event.chatId !== this.env.LARK_SALES_INBOX_CHAT_ID) {
        await this.operational.completeEvent(eventKey);
        return;
      }

      // Strict root-chat isolation: root-level team messages never bridge to LINE.
      if (!event.rootMessageId) {
        await this.lark.sendCard(
          event.chatId,
          buildThreadGuardWarningCard(),
          await stableUuid(`thread-guard:${event.messageId}`),
        );
        await this.operational.completeEvent(eventKey);
        return;
      }

      const route = await this.operational.getCaseByRootMessageId(event.rootMessageId);
      if (!route) {
        await this.operational.completeEvent(eventKey);
        return;
      }
      if (route.status === "RESOLVED") {
        await this.lark.replyText(event.rootMessageId, "⛔ เคสนี้ปิดแล้ว ข้อความไม่ได้ถูกส่งไป LINE");
        await this.operational.completeEvent(eventKey);
        return;
      }
      if (!route.owner_open_id) {
        await this.lark.replyText(event.rootMessageId, "⛔ กรุณากด ‘รับเคสนี้’ ก่อนเริ่มตอบลูกค้า");
        await this.operational.completeEvent(eventKey);
        return;
      }

      const responderName = await this.lark.getUserDisplayName(event.senderOpenId);

      if (event.messageType === "text" && event.text.trim()) {
        const command = parseSalesCommand(event.text);
        if (command.type === "close_deal" || command.type === "close_amount_candidate" && route.status === "PAYMENT") {
          if (route.owner_open_id !== event.senderOpenId) {
            await this.lark.replyText(event.rootMessageId, `⛔ การปิดยอดทำได้โดย Case Owner (${route.owner_name ?? "Sales"}) เท่านั้น`);
            await this.operational.completeEvent(eventKey);
            return;
          }
          const amount = command.amount;
          const draftId = newId("draft");
          await this.operational.createDraft({
            draft_id: draftId,
            kind: "close_deal",
            case_id: route.case_id,
            created_by: event.senderOpenId,
            payload: { amount },
          });
          await this.lark.replyCard(event.rootMessageId, buildCloseDealConfirmCard(route.case_id, draftId, amount));
          await this.operational.completeEvent(eventKey);
          return;
        }

        if (command.type === "campaign" || command.type === "campaign_menu") {
          if (route.owner_open_id !== event.senderOpenId) {
            await this.lark.replyText(event.rootMessageId, `⛔ Broadcast ทำได้โดย Case Owner (${route.owner_name ?? "Sales"}) เท่านั้น`);
            await this.operational.completeEvent(eventKey);
            return;
          }
          if (command.type === "campaign") await this.lark.replyCard(event.rootMessageId, buildCampaignFormCard(route.case_id, command.segment));
          else await this.lark.replyCard(event.rootMessageId, buildCampaignSegmentMenuCard(route.case_id));
          await this.operational.completeEvent(eventKey);
          return;
        }

        await pushLineMessages(
          this.env,
          route.line_user_id,
          [lineText(event.text)],
          await stableUuid(`line-reply:${event.messageId}`),
        );
      } else if (["image", "file", "audio", "location", "sticker"].includes(event.messageType)) {
        try {
          await this.sendMediaToLine(event, route.case_id, route.line_user_id);
        } catch (error) {
          if (!(error instanceof LarkResourceTooLargeError)) throw error;
          await this.lark.replyText(event.rootMessageId, `⚠️ ไฟล์นี้ไม่ได้ส่งไป LINE: ${error.message}`);
          await this.operational.completeEvent(eventKey);
          return;
        }
      } else {
        await this.lark.replyText(event.rootMessageId, `ℹ️ ข้อความชนิด ${event.messageType} ยังไม่มี mapping ไป LINE และไม่ได้ถูกส่ง`);
        await this.operational.completeEvent(eventKey);
        return;
      }

      // First Response is recorded only after an outbound LINE API request was
      // accepted/recovered as accepted. Oversized/unsupported media never counts.
      const updatedRoute = await this.operational.markFirstResponse(route.case_id, event.occurredAt || Date.now());
      await this.base.createMessageTracking({
        tracking_id: `lark:${event.messageId}`,
        case_id: route.case_id,
        customer_id: route.customer_id,
        sales_id: event.senderOpenId,
        sales_name: responderName,
        direction: "sales_to_customer",
        message_type: event.messageType,
        message_id: event.messageId,
        message_text: messageSummary(event, responderName),
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
