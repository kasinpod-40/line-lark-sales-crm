import type { Env } from "../config/env";
import type { AIAnalysisResult } from "../ai/ai.types";
import { analyzeIncomingText } from "../ai/ai.service";
import { analyzeImage } from "../ai/image-ai.service";
import type { CustomerSnapshot } from "../core/models";
import { newId, stableUuid } from "../utils/id";
import { buildCaseCard } from "../providers/lark/lark.cards";
import { LarkClient } from "../providers/lark/lark.client";
import { downloadExternalContent, downloadLineMessageContent, getLineUserProfile } from "../providers/line/line.provider";
import type { LineEventQueueMessage } from "../queues/line-event.types";
import { LarkBaseRepository } from "../storage/lark-base.repository";
import { OperationalRepository } from "../storage/operational.repository";

function fallbackName(lineUserId: string): string {
  return `LINE User ${lineUserId.slice(-6)}`;
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
  if (event.message.type === "sticker") return `LINE Sticker package=${event.message.package_id ?? "-"} sticker=${event.message.sticker_id ?? "-"}`;
  return ai?.ai_summary || "ลูกค้าส่งรูปภาพ";
}

export class CaseService {
  private readonly operational: OperationalRepository;
  private readonly base: LarkBaseRepository;
  private readonly lark: LarkClient;

  constructor(private readonly env: Env) {
    this.operational = new OperationalRepository(env);
    this.base = new LarkBaseRepository(env);
    this.lark = new LarkClient(env);
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
      let imageBytes: ArrayBuffer | null = null;
      let imageMime = "";
      if (event.message.type === "image") {
        const downloaded = event.message.content_provider_type === "external" && event.message.original_content_url
          ? await downloadExternalContent(event.message.original_content_url)
          : await downloadLineMessageContent(this.env, event.message.id);
        if (!downloaded.mime_type.startsWith("image/")) throw new Error(`LINE message content is not an image: ${downloaded.mime_type}`);
        imageBytes = downloaded.bytes;
        imageMime = downloaded.mime_type;
        ai = imageAiToAnalysis(await analyzeImage(this.env, downloaded.bytes, downloaded.mime_type));
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
          // A second Queue consumer can race here. The partial unique index on
          // active line_user_id is authoritative; if another consumer won,
          // attach this message to that same case instead of creating a duplicate.
          const concurrent = await this.operational.findActiveCaseByLineUserId(event.user_id);
          if (!concurrent) throw error;
          route = await this.operational.updateInbound(concurrent.case_id, inboundSnapshot);
        }
      } else {
        route = await this.operational.updateInbound(route.case_id, inboundSnapshot);
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

      if (event.message.type === "image" && imageBytes) {
        const extension = imageMime.includes("png") ? "png" : imageMime.includes("webp") ? "webp" : "jpg";
        const imageKey = await this.lark.uploadMessageImage(imageBytes, imageMime, `line-${event.message.id}.${extension}`);
        await this.lark.replyImage(route.root_message_id, imageKey);
        await this.lark.replyText(route.root_message_id, `ลูกค้า • ${messageText(event, ai)}`);
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
