import type { Env } from "../config/env";
import type { CampaignDraft, CaseRoute, QuoteDraft } from "../core/models";
import { buildDirectCloseQuote } from "../core/deal";
import { buildPromptPayPayload } from "../core/promptpay";
import { parseQuoteForm } from "../core/quote";
import { analyzeByRules } from "../ai/rule-engine";
import {
  buildCampaignFormCard,
  buildCampaignPreviewCard,
  buildCancelledDraftCard,
  buildCaseCard,
  buildCloseDealConfirmCard,
  buildPaymentFormCard,
  buildPaymentPreviewCard,
  buildQuoteFormCard,
  buildQuotePreviewCard,
} from "../providers/lark/lark.cards";
import { LarkClient } from "../providers/lark/lark.client";
import { paymentConfirmationFlex, paymentFlex, quotationFlex } from "../providers/line/line.flex";
import { getLineUserProfile, pushLineMessages, type LineImageMessage } from "../providers/line/line.provider";
import { LarkBaseRepository } from "../storage/lark-base.repository";
import { OperationalRepository } from "../storage/operational.repository";
import { asNumber, asString, isRecord, type UnknownRecord } from "../utils/json";
import { newId, stableUuid } from "../utils/id";
import { parseMoney } from "../utils/money";

export interface CardActionEvent {
  eventId: string;
  operatorOpenId: string;
  messageId?: string;
  action: string;
  value: UnknownRecord;
  formValue: UnknownRecord;
}

type PaymentDraft = { amount: number; note?: string; deal_record_id: string };
type CloseDealDraft = { amount: number };
type CampaignStoredDraft = { campaign: CampaignDraft; recipients: string[] };

function companyName(env: Env): string {
  return env.COMPANY_NAME?.trim() || "Sales Team";
}

function positiveMoney(value: unknown): number {
  const amount = parseMoney(value, -1);
  if (!(amount > 0)) throw new Error("ยอดเงินต้องมากกว่า 0");
  return amount;
}

function requireHttpsOrBlank(value: string): string | undefined {
  const text = value.trim();
  if (!text) return undefined;
  const parsed = new URL(text);
  if (parsed.protocol !== "https:") throw new Error("CTA URL ต้องเป็น HTTPS");
  return parsed.toString();
}

export class CardActionService {
  private readonly operational: OperationalRepository;
  private readonly base: LarkBaseRepository;
  private readonly lark: LarkClient;

  constructor(private readonly env: Env) {
    this.operational = new OperationalRepository(env);
    this.base = new LarkBaseRepository(env);
    this.lark = new LarkClient(env);
  }

  private async routeFor(event: CardActionEvent): Promise<CaseRoute> {
    const caseId = asString(event.value.case_id).trim();
    if (!caseId) throw new Error("Card action missing case_id");
    const route = await this.operational.getCase(caseId);
    if (!route) throw new Error("ไม่พบเคสนี้");
    return route;
  }

  private requireRoot(route: CaseRoute): string {
    if (!route.root_message_id) throw new Error("เคสยังไม่มี root message");
    return route.root_message_id;
  }

  private requireOwner(route: CaseRoute, openId: string): void {
    if (route.status === "RESOLVED") throw new Error("เคสนี้ปิดแล้ว ไม่สามารถใช้ action เก่าได้");
    if (!route.owner_open_id) throw new Error("กรุณารับเคสก่อนทำรายการ");
    if (route.owner_open_id !== openId) throw new Error(`Action นี้ทำได้โดย Case Owner (${route.owner_name ?? "Sales"}) เท่านั้น`);
  }

  private async customerName(route: CaseRoute): Promise<string> {
    const profile = await getLineUserProfile(this.env, route.line_user_id).catch(() => null);
    return profile?.displayName?.trim() || `LINE User ${route.line_user_id.slice(-6)}`;
  }

  private async quoteCardMessageId(caseId: string): Promise<string | null> {
    const stateId = `ui:quote-card:${caseId}`;
    const row = await this.env.DB.prepare(
      "SELECT payload_json FROM interaction_drafts WHERE draft_id=? LIMIT 1",
    ).bind(stateId).first<UnknownRecord>();
    if (!row) return null;
    try {
      const payload: unknown = JSON.parse(asString(row.payload_json, "{}"));
      return isRecord(payload) ? asString(payload.message_id).trim() || null : null;
    } catch {
      return null;
    }
  }

  private async rememberQuoteCardMessageId(caseId: string, createdBy: string, messageId: string): Promise<void> {
    const stateId = `ui:quote-card:${caseId}`;
    const now = Date.now();
    const expiresAt = now + 365 * 24 * 60 * 60_000;
    await this.env.DB.prepare(
      `INSERT INTO interaction_drafts
        (draft_id,kind,case_id,created_by,payload_json,status,recipient_count,created_at,expires_at,completed_at)
       VALUES (?,?,?,?,?,'PENDING',NULL,?,?,NULL)
       ON CONFLICT(draft_id) DO UPDATE SET
         case_id=excluded.case_id,
         created_by=excluded.created_by,
         payload_json=excluded.payload_json,
         status='PENDING',
         expires_at=excluded.expires_at,
         completed_at=NULL`,
    ).bind(
      stateId,
      "quote_ui",
      caseId,
      createdBy,
      JSON.stringify({ message_id: messageId }),
      now,
      expiresAt,
    ).run();
  }

  private async openOrResetQuoteCard(route: CaseRoute, operatorOpenId: string): Promise<void> {
    const root = this.requireRoot(route);
    const card = buildQuoteFormCard(route.case_id, asNumber(this.env.QUOTE_DEFAULT_VAT_RATE, 7), 1, {});
    const existingMessageId = await this.quoteCardMessageId(route.case_id);
    if (existingMessageId) {
      try {
        await this.lark.patchCard(existingMessageId, card);
        return;
      } catch {
        // The remembered message may have been deleted manually. Fall through
        // to create exactly one replacement and remember the new message id.
      }
    }
    const messageId = await this.lark.replyCard(root, card);
    if (!messageId) throw new Error("Lark ไม่คืน message_id ของ Quote Form");
    await this.rememberQuoteCardMessageId(route.case_id, operatorOpenId, messageId);
  }

  private async refreshRoot(
    route: CaseRoute,
    options: { dealAmount?: number; performance?: Awaited<ReturnType<LarkBaseRepository["getSalesPerformance"]>> } = {},
  ): Promise<void> {
    const root = this.requireRoot(route);
    const ai = analyzeByRules(route.latest_message_text ?? "");
    if (route.latest_intent) ai.intent = route.latest_intent as typeof ai.intent;
    await this.lark.patchCard(root, buildCaseCard({
      route,
      customerName: await this.customerName(route),
      latestMessage: route.latest_message_text ?? "-",
      ai,
      dealAmount: options.dealAmount,
      performance: options.performance,
    }));
  }

  private async replyError(route: CaseRoute | null, message: string): Promise<void> {
    if (!route?.root_message_id) return;
    await this.lark.replyText(route.root_message_id, `❌ ${message}`).catch(() => undefined);
  }

  async handle(event: CardActionEvent): Promise<void> {
    const actionKey = `card:${event.eventId}`;
    const acquired = await this.operational.acquireAction(actionKey, event.action || "card_action");
    if (!acquired) return;
    let route: CaseRoute | null = null;

    try {
      if (event.action === "cancel_draft") {
        const draftId = asString(event.value.draft_id);
        const draft = draftId ? await this.operational.getDraft<unknown>(draftId) : null;
        if (!draft) {
          if (event.messageId) await this.lark.patchCard(event.messageId, buildCancelledDraftCard());
          await this.operational.completeAction(actionKey);
          return;
        }
        route = await this.operational.getCase(draft.case_id);
        if (!route) throw new Error("ไม่พบเคสของ draft นี้");
        this.requireOwner(route, event.operatorOpenId);
        if (draft.created_by !== event.operatorOpenId) throw new Error("คุณไม่ใช่ผู้สร้างรายการนี้");
        await this.operational.finishDraft(draftId, "CANCELLED");
        if (event.messageId) {
          await this.lark.patchCard(event.messageId, buildCancelledDraftCard(draft.kind));
          if (draft.kind === "quote") {
            await this.rememberQuoteCardMessageId(route.case_id, event.operatorOpenId, event.messageId);
          }
        } else {
          await this.lark.replyText(this.requireRoot(route), "⚪ รายการนี้ถูกยกเลิกแล้ว");
        }
        await this.operational.completeAction(actionKey);
        return;
      }

      route = await this.routeFor(event);
      const root = this.requireRoot(route);

      switch (event.action) {
        case "claim_case": {
          const ownerName = await this.lark.getUserDisplayName(event.operatorOpenId);
          const claimed = await this.operational.claimCase(route.case_id, event.operatorOpenId, ownerName);
          route = claimed.route;
          if (!claimed.won) {
            await this.lark.replyText(root, `ℹ️ เคสนี้ถูก ${route.owner_name ?? "Sales คนอื่น"} รับไปแล้ว`);
            break;
          }
          await this.base.updateCustomerOwner(route.customer_id, event.operatorOpenId, ownerName);
          await this.base.upsertCaseTracking(route);
          await this.refreshRoot(route);
          await this.lark.replyText(root, `✅ ${ownerName} รับเคสนี้แล้ว`);
          break;
        }

        case "open_quote_form": {
          this.requireOwner(route, event.operatorOpenId);
          await this.openOrResetQuoteCard(route, event.operatorOpenId);
          break;
        }

        case "quote_add_item": {
          this.requireOwner(route, event.operatorOpenId);
          if (!event.messageId) throw new Error("ไม่พบ Quote Form message สำหรับเพิ่มรายการ");
          const currentCount = Math.max(1, Math.min(5, Math.round(asNumber(event.value.item_count, 1))));
          const nextCount = Math.min(5, currentCount + 1);
          await this.lark.patchCard(
            event.messageId,
            buildQuoteFormCard(
              route.case_id,
              asNumber(this.env.QUOTE_DEFAULT_VAT_RATE, 7),
              nextCount,
              event.formValue,
            ),
          );
          await this.rememberQuoteCardMessageId(route.case_id, event.operatorOpenId, event.messageId);
          break;
        }

        case "submit_quote_preview": {
          this.requireOwner(route, event.operatorOpenId);
          const quote = parseQuoteForm(event.formValue, { defaultVatRate: asNumber(this.env.QUOTE_DEFAULT_VAT_RATE, 7) });
          const draftId = newId("draft");
          await this.operational.createDraft({ draft_id: draftId, kind: "quote", case_id: route.case_id, created_by: event.operatorOpenId, payload: quote });
          const preview = buildQuotePreviewCard(route.case_id, draftId, quote);
          if (event.messageId) {
            await this.lark.patchCard(event.messageId, preview);
            await this.rememberQuoteCardMessageId(route.case_id, event.operatorOpenId, event.messageId);
          } else {
            const messageId = await this.lark.replyCard(root, preview);
            if (messageId) await this.rememberQuoteCardMessageId(route.case_id, event.operatorOpenId, messageId);
          }
          break;
        }

        case "confirm_quote": {
          this.requireOwner(route, event.operatorOpenId);
          const draftId = asString(event.value.draft_id);
          const draft = await this.operational.getDraft<QuoteDraft>(draftId);
          if (!draft || draft.kind !== "quote" || draft.case_id !== route.case_id || draft.created_by !== event.operatorOpenId) throw new Error("ใบเสนอราคานี้หมดอายุหรือไม่ถูกต้อง");
          const dealRecordId = await this.base.saveQuote({ dealId: `deal:${draft.draft_id}`, route, quote: draft.payload, quotationStatus: "Pending Send" });
          await this.operational.setDealRecord(route.case_id, dealRecordId);
          await pushLineMessages(this.env, route.line_user_id, [quotationFlex(companyName(this.env), await this.customerName(route), draft.payload)], await stableUuid(`quote:${draft.draft_id}`));
          await this.base.markQuoteSent(dealRecordId);
          await this.base.markCustomerQuotationSent(route.customer_id);
          route = await this.operational.setCaseStatus(route.case_id, "QUOTED");
          await this.base.upsertCaseTracking(route);
          await this.operational.finishDraft(draft.draft_id);
          if (event.messageId) await this.rememberQuoteCardMessageId(route.case_id, event.operatorOpenId, event.messageId);
          await this.refreshRoot(route, { dealAmount: draft.payload.total_amount });
          await this.lark.replyText(root, `✅ บันทึก ${draft.payload.quotation_no} และส่ง LINE แล้ว • ฿${draft.payload.total_amount.toLocaleString("th-TH")}`);
          break;
        }

        case "open_qr_form": {
          this.requireOwner(route, event.operatorOpenId);
          const latest = await this.base.getLatestDealForCase(route.case_id);
          const amount = latest?.deal.payment_amount || latest?.deal.total_amount || 0;
          if (!(amount > 0)) throw new Error("ยังไม่มีใบเสนอราคาหรือยอดสำหรับสร้าง QR");
          await this.lark.replyCard(root, buildPaymentFormCard(route.case_id, amount));
          break;
        }

        case "submit_qr_preview": {
          this.requireOwner(route, event.operatorOpenId);
          const latest = await this.base.getLatestDealForCase(route.case_id);
          if (!latest) throw new Error("ยังไม่มี Sales_Deals สำหรับเคสนี้");
          const amount = positiveMoney(event.formValue.amount);
          const note = asString(event.formValue.note).trim() || undefined;
          const draftId = newId("draft");
          const payload: PaymentDraft = { amount, note, deal_record_id: latest.recordId };
          await this.operational.createDraft({ draft_id: draftId, kind: "payment", case_id: route.case_id, created_by: event.operatorOpenId, payload });
          await this.lark.replyCard(root, buildPaymentPreviewCard(route.case_id, draftId, amount, note));
          break;
        }

        case "confirm_qr": {
          this.requireOwner(route, event.operatorOpenId);
          const draftId = asString(event.value.draft_id);
          const draft = await this.operational.getDraft<PaymentDraft>(draftId);
          if (!draft || draft.kind !== "payment" || draft.case_id !== route.case_id || draft.created_by !== event.operatorOpenId) throw new Error("QR draft หมดอายุหรือไม่ถูกต้อง");
          const payload = buildPromptPayPayload(this.env.PROMPTPAY_TARGET, draft.payload.amount, this.env.PROMPTPAY_TARGET_TYPE ?? "phone");
          const token = await stableUuid(`qr-asset:${draft.draft_id}`);
          const ttlSeconds = Math.max(3600, asNumber(this.env.QR_TTL_SECONDS, 604800));
          const now = Date.now();
          await this.operational.createQrAsset({
            token,
            case_id: route.case_id,
            deal_record_id: draft.payload.deal_record_id,
            amount_satang: Math.round(draft.payload.amount * 100),
            promptpay_payload: payload,
            created_at: now,
            expires_at: now + ttlSeconds * 1000,
          });
          const baseUrl = this.env.PUBLIC_BASE_URL.replace(/\/$/, "");
          if (!baseUrl.startsWith("https://")) throw new Error("PUBLIC_BASE_URL ต้องเป็น HTTPS");
          const qrUrl = `${baseUrl}/assets/qr/${token}.png`;
          const image: LineImageMessage = { type: "image", originalContentUrl: qrUrl, previewImageUrl: qrUrl };
          await this.base.markQrState(draft.payload.deal_record_id, draft.payload.amount, "Pending QR Send");
          await pushLineMessages(this.env, route.line_user_id, [paymentFlex(companyName(this.env), draft.payload.amount, draft.payload.note), image], await stableUuid(`qr:${draft.draft_id}`));
          await this.base.markQrState(draft.payload.deal_record_id, draft.payload.amount, "QR Sent");
          route = await this.operational.setCaseStatus(route.case_id, "PAYMENT");
          await this.base.upsertCaseTracking(route);
          await this.operational.finishDraft(draft.draft_id);
          await this.refreshRoot(route, { dealAmount: draft.payload.amount });
          await this.lark.replyText(root, `✅ ส่ง PromptPay QR ฿${draft.payload.amount.toLocaleString("th-TH")} เข้า LINE แล้ว`);
          break;
        }

        case "close_deal_prompt": {
          this.requireOwner(route, event.operatorOpenId);
          const latest = await this.base.getLatestDealForCase(route.case_id);
          const amount = latest?.deal.payment_amount || latest?.deal.total_amount || 0;
          if (!(amount > 0)) throw new Error("ยังไม่มียอด Deal — ใช้คำสั่งใน Thread เช่น ‘ปิดยอด 45000’ เพื่อระบุยอด Manual");
          const draftId = newId("draft");
          await this.operational.createDraft<CloseDealDraft>({ draft_id: draftId, kind: "close_deal", case_id: route.case_id, created_by: event.operatorOpenId, payload: { amount } });
          await this.lark.replyCard(root, buildCloseDealConfirmCard(route.case_id, draftId, amount));
          break;
        }

        case "confirm_close_deal": {
          this.requireOwner(route, event.operatorOpenId);
          const draftId = asString(event.value.draft_id);
          const draft = await this.operational.getDraft<CloseDealDraft>(draftId);
          if (!draft || draft.kind !== "close_deal" || draft.case_id !== route.case_id || draft.created_by !== event.operatorOpenId) throw new Error("Close Deal draft หมดอายุหรือไม่ถูกต้อง");

          let latest = await this.base.getLatestDealForCase(route.case_id);
          if (!latest) {
            const directRecordId = await this.base.saveQuote({
              dealId: `deal:direct:${draft.draft_id}`,
              route,
              quote: buildDirectCloseQuote(draft.payload.amount, `DIRECT-${route.case_id}`),
              quotationStatus: "Not Required",
            });
            await this.operational.setDealRecord(route.case_id, directRecordId);
            latest = await this.base.getLatestDealForCase(route.case_id);
          }
          if (!latest) throw new Error("ไม่สามารถสร้าง Sales_Deals สำหรับปิดยอดได้");

          await this.base.closeDeal(latest.recordId, draft.payload.amount);
          const lifetime = await this.base.getCustomerLifetimeValue(route.customer_id);
          await this.base.markCustomerActive(route.customer_id, lifetime);
          await pushLineMessages(this.env, route.line_user_id, [paymentConfirmationFlex(companyName(this.env), draft.payload.amount)], await stableUuid(`close-deal:${draft.draft_id}`));
          route = await this.operational.setCaseStatus(route.case_id, "WON");
          await this.base.upsertCaseTracking(route);
          await this.operational.finishDraft(draft.draft_id);
          await this.refreshRoot(route, { dealAmount: draft.payload.amount });
          await this.lark.replyText(root, `🏆 Closed Won ฿${draft.payload.amount.toLocaleString("th-TH")} เรียบร้อย`);
          break;
        }

        case "close_case": {
          this.requireOwner(route, event.operatorOpenId);
          route = await this.operational.setCaseStatus(route.case_id, "RESOLVED", Date.now());
          await this.base.upsertCaseTracking(route);
          const latest = await this.base.getLatestDealForCase(route.case_id);
          const performance = route.owner_open_id ? await this.base.getSalesPerformance(route.owner_open_id) : undefined;
          await this.refreshRoot(route, { dealAmount: latest?.deal.payment_amount ?? latest?.deal.total_amount, performance });
          await this.lark.replyText(root, "✅ ปิดเคสและอัปเดต SLA / Sales Performance แล้ว");
          break;
        }

        case "open_campaign_form": {
          this.requireOwner(route, event.operatorOpenId);
          const segment = asString(event.value.segment) === "vip" ? "vip" : "retarget";
          await this.lark.replyCard(root, buildCampaignFormCard(route.case_id, segment));
          break;
        }

        case "submit_campaign_preview": {
          this.requireOwner(route, event.operatorOpenId);
          const segment = asString(event.value.segment) === "vip" ? "vip" : "retarget";
          const title = asString(event.formValue.title).trim();
          const detail = asString(event.formValue.detail).trim();
          if (!title || !detail) throw new Error("กรุณากรอกชื่อและรายละเอียดโปรโมชัน");
          const campaign: CampaignDraft = {
            segment,
            title,
            detail,
            coupon_code: asString(event.formValue.coupon_code).trim() || undefined,
            cta_label: asString(event.formValue.cta_label).trim() || undefined,
            cta_url: requireHttpsOrBlank(asString(event.formValue.cta_url)),
            valid_until: asString(event.formValue.valid_until).trim() || undefined,
          };
          const recipients = await this.base.listSegmentLineUsers(segment);
          const draftId = newId("draft");
          await this.operational.createDraft<CampaignStoredDraft>({
            draft_id: draftId,
            kind: "campaign",
            case_id: route.case_id,
            created_by: event.operatorOpenId,
            payload: { campaign, recipients },
            recipient_count: recipients.length,
            ttlMs: 60 * 60_000,
          });
          await this.lark.replyCard(root, buildCampaignPreviewCard(route.case_id, draftId, campaign, recipients.length));
          break;
        }

        case "confirm_campaign": {
          this.requireOwner(route, event.operatorOpenId);
          const draftId = asString(event.value.draft_id);
          const draft = await this.operational.getDraft<CampaignStoredDraft>(draftId);
          if (!draft || draft.kind !== "campaign" || draft.case_id !== route.case_id || draft.created_by !== event.operatorOpenId) throw new Error("Campaign draft หมดอายุหรือไม่ถูกต้อง");
          await this.env.LINE_EVENTS_QUEUE.send({
            schema_version: 1,
            channel: "CRM",
            job_type: "campaign_dispatch",
            draft_id: draft.draft_id,
            case_id: route.case_id,
          }, { contentType: "json" });
          await this.lark.replyText(root, `⏳ รับงาน Campaign ${draft.payload.campaign.segment.toUpperCase()} แล้ว • ${draft.payload.recipients.length} LINE users • ระบบกำลังส่งผ่าน Queue`);
          break;
        }

        default:
          throw new Error(`ไม่รองรับ Card action: ${event.action}`);
      }

      await this.operational.completeAction(actionKey);
    } catch (error) {
      await this.operational.failAction(actionKey, error).catch(() => undefined);
      await this.replyError(route, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
}
