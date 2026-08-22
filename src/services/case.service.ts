import type { Env } from "../config/env";
import type { AIAnalysisResult } from "../ai/ai.types";
import { analyzeIncomingText } from "../ai/ai.service";
import { analyzeImage } from "../ai/image-ai.service";
import type { CustomerSnapshot } from "../core/models";
import { newId, stableUuid } from "../utils/id";
import { buildCaseCard } from "../providers/lark/lark.cards";
import { LarkClient } from "../providers/lark/lark.client";
import {
  downloadExternalContent,
  downloadLineMessageContent,
  getLineUserProfile,
  LineContentTooLargeError,
} from "../providers/line/line.provider";
import type { LineEventQueueMessage } from "../queues/line-event.types";
import { LarkBaseRepository } from "../storage/lark-base.repository";
import { OperationalRepository } from "../storage/operational.repository";
import { MediaAssetService } from "./media-asset.service";

const MAX_LARK_INLINE_FILE_BYTES = 25 * 1024 * 1024;

function fallbackName(lineUserId: string): string {
  return `LINE User ${lineUserId.slice(-6)}`;
}

function fileNameFor(event: LineEventQueueMessage, mimeType: string): string {
  if (event.message.file_name?.trim()) return event.message.file_name.trim();
  if (mimeType === "application/pdf") return `line-${event.message.id}.pdf`;
  if (mimeType === "audio/mpeg") return `line-${event.message.id}.mp3`;
  if (mimeType === "audio/mp4" || mimeType === "audio/x-m4a") return `line-${event.message.id}.m4a`;
  if (mimeType === "audio/ogg") return `line-${event.message.id}.ogg`;
  return `line-${event.message.id}.bin`;
}

function imageAiToAnalysis(image: Awaited<ReturnType<typeof analyzeImage>>): AIAnalysisResult {
  if (image.image_type === "payment_slip") {
    return {
      intent: "payment_slip",
      buyer_intent: "Ready To Buy",
      customer_stage: "Closing",
      lead_score: 95,
      hot_lead: true,
      ai_summary: image.summary,
      provider: "safe_fallback",
      confidence: image.confidence,
      image_ai: image,
    };
  }
  if (image.image_type === "product_image") {
    return {
      intent: "product_info",
      buyer_intent: "Interested",
      customer_stage: "Interested",
      lead_score: 55,
      hot_lead: false,
      ai_summary: image.summary,
      provider: "safe_fallback",
      confidence: image.confidence,
      image_ai: image,
    };
  }
  return {
    intent: "image_received",
    buyer_intent: "Just Browsing",
    customer_stage: "New Lead",
    lead_score: 25,
    hot_lead: false,
    ai_summary: image.summary,
    provider: "safe_fallback",
    confidence: image.confidence,
    image_ai: image,
  };
}

function messageText(event: LineEventQueueMessage, ai?: AIAnalysisResult): string {
  if (event.message.type === "text") return event.message.text?.trim() || "(ข้อความว่าง)";
  if (event.message.type === "sticker") return `ลูกค้าส่ง LINE Sticker package=${event.message.package_id ?? "-"} sticker=${event.message.sticker_id ?? "-"}`;
  if (event.message.type === "file") return `ลูกค้าส่งไฟล์ ${event.message.file_name ?? "attachment"}`;
  if (event.message.type === "audio") return `ลูกค้าส่งไฟล์เสียง${event.message.duration_ms ? ` (${Math.round(event.message.duration_ms / 1000)} วินาที)` : ""}`;
  if (event.message.type === "location") return `ลูกค้าส่งพิกัด ${event.message.title ?? ""} ${event.message.address ?? ""}`.trim();
  return ai?.ai_summary || "ลูกค้าส่งรูปภาพ";
}

export class CaseService {
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

  async processLineEvent(event: LineEventQueueMessage): Promise<void> {
    const eventKey = `line:${event.webhook_event_id || event.message.id}`;
    const acquired = await this.operational.acquireEvent(eventKey, "line_inbound");
    if (!acquired) return;

    try {
      const profile = await getLineUserProfile(this.env, event.user_id).catch((error) => {
        console.warn("LINE_PROFILE_FALLBACK", error instanceof Error ? error.message : String(error));
        return null;
      });
      const customerName = profile?.displayName?.trim() || fallbackName(event.user_id);

      let ai: AIAnalysisResult;
      let downloadedBytes: ArrayBuffer | null = null;
      let downloadedMime = "";
      let bridgeMediaSkippedReason = "";
      if (event.message.type === "image") {
        const downloaded = event.message.content_provider_type === "external" && event.message.original_content_url
          ? await downloadExternalContent(event.message.original_content_url, MAX_LARK_INLINE_FILE_BYTES)
          : await downloadLineMessageContent(this.env, event.message.id, MAX_LARK_INLINE_FILE_BYTES);
        if (!downloaded.mime_type.startsWith("image/")) throw new Error(`LINE message content is not an image: ${downloaded.mime_type}`);
        downloadedBytes = downloaded.bytes;
        downloadedMime = downloaded.mime_type;
        ai = imageAiToAnalysis(await analyzeImage(this.env, downloaded.bytes, downloaded.mime_type));
      } else if (event.message.type === "file" && (event.message.file_size ?? 0) > MAX_LARK_INLINE_FILE_BYTES) {
        bridgeMediaSkippedReason = `ไฟล์ใหญ่เกิน ${Math.round(MAX_LARK_INLINE_FILE_BYTES / 1024 / 1024)} MB`;
        ai = await analyzeIncomingText(this.env, messageText(event));
      } else if (event.message.type === "file" || event.message.type === "audio") {
        try {
          const downloaded = event.message.content_provider_type === "external" && event.message.original_content_url
            ? await downloadExternalContent(event.message.original_content_url, MAX_LARK_INLINE_FILE_BYTES)
            : await downloadLineMessageContent(this.env, event.message.id, MAX_LARK_INLINE_FILE_BYTES);
          downloadedBytes = downloaded.bytes;
          downloadedMime = downloaded.mime_type;
        } catch (error) {
          if (!(error instanceof LineContentTooLargeError)) throw error;
          bridgeMediaSkippedReason = error.message;
        }
        ai = await analyzeIncomingText(this.env, messageText(event));
      } else {
        ai = await analyzeIncomingText(this.env, messageText(event));
      }

      const customerId = `line:${event.user_id}`;
      const inboundSnapshot = {
        latest_line_message_id: event.message.id,
        latest_message_text: messageText(event, ai),
        latest_intent: ai.intent,
      };
      let route = await this.operational.findActiveCaseByLineUserId(event.user_id);
      if (!route) {
        try {
          route = await this.operational.createCase({
            case_id: newId("case"),
            line_user_id: event.user_id,
            customer_id: customerId,
            opened_at: event.occurred_at || Date.now(),
            ...inboundSnapshot,
          });
        } catch (error) {
          const concurrent = await this.operational.findActiveCaseByLineUserId(event.user_id);
          if (!concurrent) throw error;
          route = await this.operational.updateInbound(concurrent.case_id, inboundSnapshot);
        }
      } else {
        route = await this.operational.updateInbound(route.case_id, inboundSnapshot);
      }

      if (ai.intent === "payment_slip" && route.owner_open_id && !["PAYMENT", "WON", "RESOLVED"].includes(route.status)) {
        route = await this.operational.setCaseStatus(route.case_id, "PAYMENT");
      }

      const lifetimeValue = await this.base.getCustomerLifetimeValue(customerId);
      const businessStage = lifetimeValue > 0 ? "Active Customer" : ai.customer_stage;
      const customer: CustomerSnapshot = {
        customer_id: customerId,
        line_user_id: event.user_id,
        display_name: customerName,
        picture_url: profile?.pictureUrl,
        stage: businessStage,
        assigned_sales_id: route.owner_open_id ?? undefined,
        assigned_sales_name: route.owner_name ?? undefined,
        ai,
        last_message_at: event.occurred_at || Date.now(),
      };
      const savedCustomer = await this.base.upsertCustomer(customer);
      if (route.customer_record_id !== savedCustomer.recordId) {
        await this.operational.attachCustomerRecord(route.case_id, savedCustomer.recordId);
      }

      if (!route.root_message_id) {
        const rootId = await this.lark.sendCard(
          this.env.LARK_SALES_INBOX_CHAT_ID,
          buildCaseCard({ route, customerName, latestMessage: messageText(event, ai), ai }),
          await stableUuid(`case-root:${route.case_id}`),
        );
        route = await this.operational.setRootMessage(route.case_id, rootId);
      } else {
        const latestDeal = await this.base.getLatestDealForCase(route.case_id);
        await this.lark.patchCard(route.root_message_id, buildCaseCard({
          route,
          customerName,
          latestMessage: messageText(event, ai),
          ai,
          dealAmount: latestDeal?.deal.payment_amount ?? latestDeal?.deal.total_amount,
        }));
      }

      if (!route.root_message_id) throw new Error("Case root Lark message was not created");

      if (event.message.type === "image" && downloadedBytes) {
        const extension = downloadedMime.includes("png") ? "png" : downloadedMime.includes("webp") ? "webp" : "jpg";
        try {
          const imageKey = await this.lark.uploadMessageImage(downloadedBytes, downloadedMime, `line-${event.message.id}.${extension}`);
          await this.lark.replyImage(route.root_message_id, imageKey);
        } catch (error) {
          const stored = await this.media.store({
            caseId: route.case_id,
            sourceMessageId: event.message.id,
            mediaKind: "image",
            bytes: downloadedBytes,
            mimeType: downloadedMime,
            fileName: `line-${event.message.id}.${extension}`,
          });
          await this.lark.replyText(route.root_message_id, `🖼 รูปจากลูกค้า (เปิดไฟล์)\n${stored.url}`);
          console.warn("LARK_IMAGE_UPLOAD_FALLBACK", error instanceof Error ? error.message : String(error));
        }
        await this.lark.replyText(route.root_message_id, `ลูกค้า • ${messageText(event, ai)}`);
      } else if ((event.message.type === "file" || event.message.type === "audio") && downloadedBytes) {
        const fileName = fileNameFor(event, downloadedMime);
        try {
          const fileKey = await this.lark.uploadMessageFile(downloadedBytes, downloadedMime, fileName, event.message.duration_ms);
          await this.lark.replyFile(route.root_message_id, fileKey);
        } catch (error) {
          const stored = await this.media.store({
            caseId: route.case_id,
            sourceMessageId: event.message.id,
            mediaKind: event.message.type === "audio" ? "audio" : "file",
            bytes: downloadedBytes,
            mimeType: downloadedMime,
            fileName,
          });
          await this.lark.replyText(route.root_message_id, `📎 ${fileName}\n${stored.url}`);
          console.warn("LARK_FILE_UPLOAD_FALLBACK", error instanceof Error ? error.message : String(error));
        }
        await this.lark.replyText(route.root_message_id, `ลูกค้า • ${messageText(event, ai)}`);
      } else if ((event.message.type === "file" || event.message.type === "audio") && !downloadedBytes) {
        await this.lark.replyText(route.root_message_id, `⚠️ ${messageText(event, ai)} • ไม่ดึงไฟล์เข้า Worker อัตโนมัติ: ${bridgeMediaSkippedReason || "เกินขนาด bridge ที่กำหนด"}`);
      } else if (event.message.type === "location") {
        const latitude = event.message.latitude;
        const longitude = event.message.longitude;
        const mapUrl = typeof latitude === "number" && typeof longitude === "number"
          ? `https://www.google.com/maps?q=${latitude},${longitude}`
          : "";
        await this.lark.replyText(route.root_message_id, `📍 ลูกค้า • ${messageText(event, ai)}${mapUrl ? `\n${mapUrl}` : ""}`);
      } else {
        await this.lark.replyText(route.root_message_id, `ลูกค้า • ${messageText(event, ai)}`);
      }

      const trackingRecordId = await this.base.upsertCaseTracking(route);
      if (route.tracking_record_id !== trackingRecordId) await this.operational.attachTrackingRecord(route.case_id, trackingRecordId);
      await this.base.createMessageTracking({
        tracking_id: `line:${event.message.id}`,
        case_id: route.case_id,
        customer_id: route.customer_id,
        sales_id: route.owner_open_id ?? undefined,
        sales_name: route.owner_name ?? undefined,
        direction: "customer_to_sales",
        message_type: event.message.type,
        message_id: event.message.id,
        message_text: messageText(event, ai),
        event_at: event.occurred_at || Date.now(),
      });

      await this.operational.completeEvent(eventKey);
    } catch (error) {
      await this.operational.failEvent(eventKey, error).catch(() => undefined);
      throw error;
    }
  }
}
