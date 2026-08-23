import type { Env } from "../config/env";
import type { CaseRoute } from "../core/models";
import { buildPromptPayPayload } from "../core/promptpay";
import { analyzeByRules } from "../ai/rule-engine";
import { buildCaseCard } from "../providers/lark/lark.cards";
import {
  buildPaymentCancelledCard,
  buildPaymentEditCard,
  buildPaymentSentCard,
  buildPaymentSinglePreviewCard,
} from "../providers/lark/payment.cards";
import { LarkClient } from "../providers/lark/lark.client";
import { paymentQrFlex } from "../providers/line/payment.flex";
import { getLineUserProfile, pushLineMessages } from "../providers/line/line.provider";
import { LarkBaseRepository } from "../storage/lark-base.repository";
import { OperationalRepository } from "../storage/operational.repository";
import { asNumber, asString, isRecord, type UnknownRecord } from "../utils/json";
import { newId, stableUuid } from "../utils/id";
import { parseMoney } from "../utils/money";
import { CommercialLifecycleService } from "./commercial-lifecycle.service";
import type { CardActionEvent } from "./card-action.service";

type PaymentDraft = { amount: number; note?: string; deal_record_id: string };

type PaymentUiState = {
  messageId: string | null;
  draftId: string | null;
};

function companyName(env: Env): string {
  return env.COMPANY_NAME?.trim() || "Sales Team";
}

function positiveMoney(value: unknown): number {
  const amount = parseMoney(value, -1);
  if (!(amount > 0)) throw new Error("ยอดเงินต้องมากกว่า 0");
  return amount;
}

export const SINGLE_CARD_PAYMENT_ACTIONS = new Set([
  "open_qr_form",
  "edit_qr_amount",
  "save_qr_amount",
  "cancel_qr_edit",
  "cancel_qr_single_card",
  "confirm_qr_single_card",
]);

export class PaymentCardActionService {
  private readonly operational: OperationalRepository;
  private readonly base: LarkBaseRepository;
  private readonly lark: LarkClient;
  private readonly lifecycle: CommercialLifecycleService;

  constructor(private readonly env: Env) {
    this.operational = new OperationalRepository(env);
    this.base = new LarkBaseRepository(env);
    this.lark = new LarkClient(env);
    this.lifecycle = new CommercialLifecycleService(env);
  }

  private async routeFor(event: CardActionEvent): Promise<CaseRoute> {
    const caseId = asString(event.value.case_id).trim();
    if (!caseId) throw new Error("Card action missing case_id");
    const route = await this.operational.getCase(caseId);
    if (!route) throw new Error("ไม่พบเคสนี้");
    return route;
  }

  private requireOwner(route: CaseRoute, openId: string): void {
    if (route.status === "RESOLVED") throw new Error("เคสนี้ปิดแล้ว ไม่สามารถใช้ action เก่าได้");
    if (!route.owner_open_id) throw new Error("กรุณารับเคสก่อนทำรายการ");
    if (route.owner_open_id !== openId) throw new Error(`Action นี้ทำได้โดย Case Owner (${route.owner_name ?? "Sales"}) เท่านั้น`);
  }

  private requireRoot(route: CaseRoute): string {
    if (!route.root_message_id) throw new Error("เคสยังไม่มี root message");
    return route.root_message_id;
  }

  private async customerName(route: CaseRoute): Promise<string> {
    const profile = await getLineUserProfile(this.env, route.line_user_id).catch(() => null);
    return profile?.displayName?.trim() || `LINE User ${route.line_user_id.slice(-6)}`;
  }

  private async refreshRoot(route: CaseRoute, amount: number): Promise<void> {
    const ai = analyzeByRules(route.latest_message_text ?? "");
    if (route.latest_intent) ai.intent = route.latest_intent as typeof ai.intent;
    await this.lark.patchCard(this.requireRoot(route), buildCaseCard({
      route,
      customerName: await this.customerName(route),
      latestMessage: route.latest_message_text ?? "-",
      ai,
      dealAmount: amount,
    }));
  }

  private async replyError(route: CaseRoute | null, message: string): Promise<void> {
    if (!route?.root_message_id) return;
    await this.lark.replyText(route.root_message_id, `❌ ${message}`).catch(() => undefined);
  }

  private async uiState(caseId: string): Promise<PaymentUiState> {
    const row = await this.env.DB.prepare(
      "SELECT payload_json FROM interaction_drafts WHERE draft_id=? LIMIT 1",
    ).bind(`ui:payment-card:${caseId}`).first<UnknownRecord>();
    if (!row) return { messageId: null, draftId: null };
    try {
      const payload: unknown = JSON.parse(asString(row.payload_json, "{}"));
      if (!isRecord(payload)) return { messageId: null, draftId: null };
      return {
        messageId: asString(payload.message_id).trim() || null,
        draftId: asString(payload.draft_id).trim() || null,
      };
    } catch {
      return { messageId: null, draftId: null };
    }
  }

  private async rememberUi(caseId: string, createdBy: string, messageId: string, draftId: string): Promise<void> {
    const stateId = `ui:payment-card:${caseId}`;
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
      "payment_ui",
      caseId,
      createdBy,
      JSON.stringify({ message_id: messageId, draft_id: draftId }),
      now,
      expiresAt,
    ).run();
  }

  private async updateDraftPayload(draftId: string, payload: PaymentDraft): Promise<void> {
    const result = await this.env.DB.prepare(
      "UPDATE interaction_drafts SET payload_json=?, expires_at=? WHERE draft_id=? AND kind='payment' AND status='PENDING'",
    ).bind(JSON.stringify(payload), Date.now() + 30 * 60_000, draftId).run();
    if ((result.meta.changes ?? 0) < 1) throw new Error("QR draft หมดอายุหรือไม่ถูกต้อง");
  }

  private async completedDraft(draftId: string): Promise<{ caseId: string; createdBy: string; payload: PaymentDraft } | null> {
    const row = await this.env.DB.prepare(
      "SELECT kind,case_id,created_by,payload_json,status FROM interaction_drafts WHERE draft_id=? LIMIT 1",
    ).bind(draftId).first<UnknownRecord>();
    if (!row || asString(row.kind) !== "payment" || asString(row.status) !== "COMPLETED") return null;
    try {
      const payload: unknown = JSON.parse(asString(row.payload_json, "{}"));
      if (!isRecord(payload)) return null;
      return {
        caseId: asString(row.case_id),
        createdBy: asString(row.created_by),
        payload: {
          amount: asNumber(payload.amount),
          note: asString(payload.note).trim() || undefined,
          deal_record_id: asString(payload.deal_record_id),
        },
      };
    } catch {
      return null;
    }
  }

  private async openSingleCard(route: CaseRoute, operatorOpenId: string): Promise<void> {
    const latest = await this.base.getLatestDealForCase(route.case_id);
    const amount = (latest?.deal.payment_amount ?? 0) > 0
      ? latest?.deal.payment_amount ?? 0
      : latest?.deal.total_amount ?? 0;
    if (!latest || !(amount > 0)) throw new Error("ยังไม่มีใบเสนอราคาหรือยอดสำหรับสร้าง QR");

    const previous = await this.uiState(route.case_id);
    if (previous.draftId) await this.operational.finishDraft(previous.draftId, "CANCELLED").catch(() => undefined);

    const draftId = newId("draft");
    const payload: PaymentDraft = { amount, deal_record_id: latest.recordId };
    await this.operational.createDraft({
      draft_id: draftId,
      kind: "payment",
      case_id: route.case_id,
      created_by: operatorOpenId,
      payload,
    });

    const preview = buildPaymentSinglePreviewCard(route.case_id, draftId, amount);
    if (previous.messageId) {
      try {
        await this.lark.patchCard(previous.messageId, preview);
        await this.rememberUi(route.case_id, operatorOpenId, previous.messageId, draftId);
        return;
      } catch {
        // The old message may have been deleted. Create exactly one replacement.
      }
    }

    const messageId = await this.lark.replyCard(this.requireRoot(route), preview);
    if (!messageId) throw new Error("Lark ไม่คืน message_id ของ QR Card");
    await this.rememberUi(route.case_id, operatorOpenId, messageId, draftId);
  }

  private async preflightQrUrl(qrUrl: string): Promise<void> {
    const response = await fetch(qrUrl, {
      method: "GET",
      headers: { "cache-control": "no-cache" },
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const bytes = await response.arrayBuffer();
    if (!response.ok || !contentType.startsWith("image/png") || bytes.byteLength < 256) {
      throw new Error(`QR PNG preflight failed: HTTP ${response.status}, content-type=${contentType || "none"}, bytes=${bytes.byteLength}`);
    }
  }

  async handle(event: CardActionEvent): Promise<void> {
    const actionKey = `card:${event.eventId}`;
    const acquired = await this.operational.acquireAction(actionKey, event.action || "payment_card_action");
    if (!acquired) return;

    let route: CaseRoute | null = null;
    try {
      route = await this.routeFor(event);
      this.requireOwner(route, event.operatorOpenId);
      const root = this.requireRoot(route);

      switch (event.action) {
        case "open_qr_form": {
          await this.openSingleCard(route, event.operatorOpenId);
          break;
        }

        case "edit_qr_amount": {
          if (!event.messageId) throw new Error("ไม่พบ QR Card สำหรับแก้ไขยอด");
          const draftId = asString(event.value.draft_id);
          const draft = await this.operational.getDraft<PaymentDraft>(draftId);
          if (!draft || draft.kind !== "payment" || draft.case_id !== route.case_id || draft.created_by !== event.operatorOpenId) {
            throw new Error("QR draft หมดอายุหรือไม่ถูกต้อง");
          }
          await this.lark.patchCard(
            event.messageId,
            buildPaymentEditCard(route.case_id, draftId, draft.payload.amount, draft.payload.note),
          );
          break;
        }

        case "save_qr_amount": {
          if (!event.messageId) throw new Error("ไม่พบ QR Card สำหรับบันทึกยอด");
          const draftId = asString(event.value.draft_id);
          const draft = await this.operational.getDraft<PaymentDraft>(draftId);
          if (!draft || draft.kind !== "payment" || draft.case_id !== route.case_id || draft.created_by !== event.operatorOpenId) {
            throw new Error("QR draft หมดอายุหรือไม่ถูกต้อง");
          }
          const payload: PaymentDraft = {
            ...draft.payload,
            amount: positiveMoney(event.formValue.amount),
            note: asString(event.formValue.note).trim() || undefined,
          };
          await this.updateDraftPayload(draftId, payload);
          await this.lark.patchCard(
            event.messageId,
            buildPaymentSinglePreviewCard(route.case_id, draftId, payload.amount, payload.note),
          );
          await this.rememberUi(route.case_id, event.operatorOpenId, event.messageId, draftId);
          break;
        }

        case "cancel_qr_edit": {
          if (!event.messageId) throw new Error("ไม่พบ QR Card");
          const draftId = asString(event.value.draft_id);
          const draft = await this.operational.getDraft<PaymentDraft>(draftId);
          if (!draft || draft.kind !== "payment" || draft.case_id !== route.case_id || draft.created_by !== event.operatorOpenId) {
            throw new Error("QR draft หมดอายุหรือไม่ถูกต้อง");
          }
          await this.lark.patchCard(
            event.messageId,
            buildPaymentSinglePreviewCard(route.case_id, draftId, draft.payload.amount, draft.payload.note),
          );
          break;
        }

        case "cancel_qr_single_card": {
          const draftId = asString(event.value.draft_id);
          const draft = await this.operational.getDraft<PaymentDraft>(draftId);
          if (!draft || draft.kind !== "payment" || draft.case_id !== route.case_id || draft.created_by !== event.operatorOpenId) {
            throw new Error("QR draft หมดอายุหรือไม่ถูกต้อง");
          }
          await this.operational.finishDraft(draftId, "CANCELLED");
          if (event.messageId) await this.lark.patchCard(event.messageId, buildPaymentCancelledCard());
          break;
        }

        case "confirm_qr_single_card": {
          const draftId = asString(event.value.draft_id);
          const draft = await this.operational.getDraft<PaymentDraft>(draftId);
          if (!draft) {
            const completed = await this.completedDraft(draftId);
            if (
              completed &&
              completed.caseId === route.case_id &&
              completed.createdBy === event.operatorOpenId &&
              event.messageId
            ) {
              await this.lark.patchCard(event.messageId, buildPaymentSentCard(completed.payload.amount));
              await this.lifecycle.reconcileCase(route.case_id);
              break;
            }
            throw new Error("QR draft หมดอายุหรือไม่ถูกต้อง");
          }
          if (draft.kind !== "payment" || draft.case_id !== route.case_id || draft.created_by !== event.operatorOpenId) {
            throw new Error("QR draft หมดอายุหรือไม่ถูกต้อง");
          }

          const promptPayPayload = buildPromptPayPayload(
            this.env.PROMPTPAY_TARGET,
            draft.payload.amount,
            this.env.PROMPTPAY_TARGET_TYPE ?? "phone",
          );
          const token = await stableUuid(`qr-asset:${draft.draft_id}`);
          const ttlSeconds = Math.max(3600, asNumber(this.env.QR_TTL_SECONDS, 604800));
          const now = Date.now();
          await this.operational.createQrAsset({
            token,
            case_id: route.case_id,
            deal_record_id: draft.payload.deal_record_id,
            amount_satang: Math.round(draft.payload.amount * 100),
            promptpay_payload: promptPayPayload,
            created_at: now,
            expires_at: now + ttlSeconds * 1000,
          });

          const baseUrl = this.env.PUBLIC_BASE_URL.replace(/\/$/, "");
          if (!baseUrl.startsWith("https://")) throw new Error("PUBLIC_BASE_URL ต้องเป็น HTTPS");
          const qrUrl = `${baseUrl}/assets/qr/${token}.png`;

          // Fail closed: the exact public PNG used by LINE must be reachable
          // before the Deal is allowed to advance to QR Sent.
          await this.preflightQrUrl(qrUrl);
          await this.base.markQrState(draft.payload.deal_record_id, draft.payload.amount, "Pending QR Send");
          await pushLineMessages(
            this.env,
            route.line_user_id,
            [paymentQrFlex(companyName(this.env), draft.payload.amount, qrUrl, draft.payload.note)],
            await stableUuid(`qr:${draft.draft_id}`),
          );
          await this.base.markQrState(draft.payload.deal_record_id, draft.payload.amount, "QR Sent");
          route = await this.operational.setCaseStatus(route.case_id, "PAYMENT");
          await this.base.upsertCaseTracking(route);
          await this.operational.finishDraft(draft.draft_id);
          await this.lifecycle.reconcileCase(route.case_id);

          if (event.messageId) {
            await this.lark.patchCard(event.messageId, buildPaymentSentCard(draft.payload.amount)).catch((error) => {
              console.warn("PAYMENT_SENT_CARD_PATCH_FAILED", error instanceof Error ? error.message : String(error));
            });
            await this.rememberUi(route.case_id, event.operatorOpenId, event.messageId, draftId);
          }

          await this.refreshRoot(route, draft.payload.amount);
          await this.lark.replyText(root, `✅ ส่ง PromptPay QR ฿${draft.payload.amount.toLocaleString("th-TH")} เข้า LINE แล้ว`);
          break;
        }

        default:
          throw new Error(`ไม่รองรับ Payment Card action: ${event.action}`);
      }

      await this.operational.completeAction(actionKey);
    } catch (error) {
      await this.operational.failAction(actionKey, error).catch(() => undefined);
      await this.replyError(route, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
}
