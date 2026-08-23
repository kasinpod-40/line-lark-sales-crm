import type { Env } from "../config/env";
import { analyzeByRules } from "../ai/rule-engine";
import { buildCaseCard } from "../providers/lark/lark.cards";
import { buildPaymentSlipAcceptedCard, buildPaymentSlipRejectedCard } from "../providers/lark/payment-slip.card";
import { LarkClient } from "../providers/lark/lark.client";
import { paymentConfirmationFlex } from "../providers/line/line.flex";
import { getLineUserProfile, pushLineMessages } from "../providers/line/line.provider";
import { LarkBaseRepository } from "../storage/lark-base.repository";
import { OperationalRepository } from "../storage/operational.repository";
import { stableUuid } from "../utils/id";
import { asString } from "../utils/json";
import type { CardActionEvent } from "./card-action.service";

export const PAYMENT_SLIP_ACTIONS = new Set([
  "confirm_slip_payment",
  "reject_payment_slip",
]);

function companyName(env: Env): string {
  return env.COMPANY_NAME?.trim() || "Sales Team";
}

export class PaymentSlipActionService {
  private readonly operational: OperationalRepository;
  private readonly base: LarkBaseRepository;
  private readonly lark: LarkClient;

  constructor(private readonly env: Env) {
    this.operational = new OperationalRepository(env);
    this.base = new LarkBaseRepository(env);
    this.lark = new LarkClient(env);
  }

  async handle(event: CardActionEvent): Promise<void> {
    const actionKey = `card:${event.eventId}`;
    const acquired = await this.operational.acquireAction(actionKey, event.action || "payment_slip_action");
    if (!acquired) return;

    try {
      const caseId = asString(event.value.case_id).trim();
      if (!caseId) throw new Error("Payment slip action missing case_id");
      let route = await this.operational.getCase(caseId);
      if (!route) throw new Error("ไม่พบเคสนี้");
      if (route.status === "RESOLVED") throw new Error("เคสนี้ปิดแล้ว");
      if (route.status !== "PAYMENT") throw new Error("การ์ดตรวจสลิปนี้ใช้ได้เฉพาะเคสที่อยู่ขั้น Payment");
      if (!route.owner_open_id) throw new Error("กรุณารับเคสก่อนตรวจสลิป");
      if (route.owner_open_id !== event.operatorOpenId) {
        throw new Error(`Action นี้ทำได้โดย Case Owner (${route.owner_name ?? "Sales"}) เท่านั้น`);
      }

      if (event.action === "reject_payment_slip") {
        if (event.messageId) await this.lark.patchCard(event.messageId, buildPaymentSlipRejectedCard());
        if (route.root_message_id) {
          await this.lark.replyText(route.root_message_id, "❌ Sales ตรวจสอบแล้ว: หลักฐานการชำระเงินนี้ไม่ถูกต้อง — ยังไม่มีการปิดยอด");
        }
        await this.operational.completeAction(actionKey);
        return;
      }

      if (event.action !== "confirm_slip_payment") throw new Error(`ไม่รองรับ Payment slip action: ${event.action}`);

      const verdict = asString(event.value.slip_verdict).trim();
      if (!["match", "mismatch", "manual_review"].includes(verdict)) {
        throw new Error("การ์ดตรวจสลิปนี้เป็นเวอร์ชันเก่าหรือยังไม่มีผลตรวจ กรุณาใช้การ์ดล่าสุด");
      }

      const latest = await this.base.getLatestDealForCase(route.case_id);
      const amount = latest?.deal.payment_amount ?? latest?.deal.total_amount ?? 0;
      if (!latest || !(amount > 0)) throw new Error("ยังไม่มี Deal/yอดชำระสำหรับยืนยันรับชำระ");

      // AI only reports what it can read and whether it appears to match the
      // persisted Deal. The Case Owner remains the final business authority and
      // may confirm after manually reviewing the actual slip, even on mismatch.
      // This action does not call a bank or PromptPay verification API and never
      // uses the AI-read slip amount as the accounting amount.
      await this.base.closeDeal(latest.recordId, amount);
      const lifetime = await this.base.getCustomerLifetimeValue(route.customer_id);
      await this.base.markCustomerActive(route.customer_id, lifetime);
      await pushLineMessages(
        this.env,
        route.line_user_id,
        [paymentConfirmationFlex(companyName(this.env), amount)],
        await stableUuid(`slip-close-deal:${event.eventId}`),
      );
      route = await this.operational.setCaseStatus(route.case_id, "WON");
      await this.base.upsertCaseTracking(route);

      if (event.messageId) await this.lark.patchCard(event.messageId, buildPaymentSlipAcceptedCard(amount));

      if (route.root_message_id) {
        const profile = await getLineUserProfile(this.env, route.line_user_id).catch(() => null);
        const customerName = profile?.displayName?.trim() || `LINE User ${route.line_user_id.slice(-6)}`;
        const ai = analyzeByRules(route.latest_message_text ?? "");
        if (route.latest_intent) ai.intent = route.latest_intent as typeof ai.intent;
        await this.lark.patchCard(route.root_message_id, buildCaseCard({
          route,
          customerName,
          latestMessage: route.latest_message_text ?? "-",
          ai,
          dealAmount: amount,
        }));
        const reviewNote = verdict === "mismatch" ? " • Sales override หลังตรวจสลิปที่ยอดไม่ตรง" : "";
        await this.lark.replyText(route.root_message_id, `🏆 Sales ยืนยันรับชำระ ฿${amount.toLocaleString("th-TH")} แล้ว • Closed Won${reviewNote}`);
      }

      await this.operational.completeAction(actionKey);
    } catch (error) {
      await this.operational.failAction(actionKey, error).catch(() => undefined);
      throw error;
    }
  }
}
