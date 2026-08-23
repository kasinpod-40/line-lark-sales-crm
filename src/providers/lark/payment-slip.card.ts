import { formatMoney } from "../../utils/money";

export interface PaymentSlipReviewCardInput {
  caseId: string;
  dealAmount: number;
  slipAmount?: number;
  slipBank?: string;
  confidence?: number;
  aiDetected: boolean;
}

type ButtonType = "primary_filled" | "danger";
type SlipVerdict = "match" | "mismatch" | "manual_review";

function md(content: string): unknown {
  return { tag: "markdown", content };
}

function callback(value: Record<string, string>): unknown {
  return { type: "callback", value };
}

function button(label: string, value: Record<string, string>, type: ButtonType): unknown {
  return {
    tag: "button",
    text: { tag: "plain_text", content: label },
    type,
    width: "fill",
    behaviors: [callback(value)],
  };
}

function twoColumns(left: unknown, right: unknown): unknown {
  return {
    tag: "column_set",
    flex_mode: "none",
    background_style: "default",
    columns: [
      { tag: "column", width: "weighted", weight: 1, vertical_align: "top", elements: [left] },
      { tag: "column", width: "weighted", weight: 1, vertical_align: "top", elements: [right] },
    ],
  };
}

function terminalCard(template: "green" | "grey", title: string, content: string, summary: string): unknown {
  return {
    schema: "2.0",
    config: {
      update_multi: true,
      width_mode: "fill",
      summary: { content: summary },
    },
    header: {
      template,
      title: { tag: "plain_text", content: title },
    },
    body: { elements: [md(content)] },
  };
}

export function buildPaymentSlipReviewCard(input: PaymentSlipReviewCardInput): unknown {
  const hasSlipAmount = typeof input.slipAmount === "number" && Number.isFinite(input.slipAmount) && input.slipAmount >= 0;
  const matches = hasSlipAmount && input.dealAmount > 0 && Math.abs((input.slipAmount ?? 0) - input.dealAmount) <= 0.01;
  const mismatch = hasSlipAmount && input.dealAmount > 0 && !matches;
  const verdict: SlipVerdict = matches ? "match" : mismatch ? "mismatch" : "manual_review";
  const confidence = typeof input.confidence === "number" && Number.isFinite(input.confidence)
    ? `${Math.round(Math.max(0, Math.min(1, input.confidence)) * 100)}%`
    : "-";

  const detection = input.aiDetected
    ? "🤖 AI ตรวจพบว่า **น่าจะเป็นสลิป/หลักฐานการชำระเงิน**"
    : "🧾 ได้รับรูปในเคสที่อยู่ขั้น **Payment** — กรุณาตรวจว่าเป็นสลิป/หลักฐานการชำระเงินหรือไม่";
  const slipAmountText = hasSlipAmount ? `฿${formatMoney(input.slipAmount ?? 0)}` : "อ่านยอดไม่ได้";
  const comparison = matches
    ? "✅ **ยอดชำระเงินถูกต้อง — ยอดในสลิปตรงกับยอดที่ต้องชำระ**"
    : mismatch
      ? "❌ **ยอดชำระเงินไม่ตรง — ระบบบล็อกการยืนยันรับชำระจากสลิปนี้**"
      : "⚠️ **AI ยังเทียบยอดไม่ได้ — กรุณาตรวจจากภาพสลิปจริงก่อนยืนยัน**";
  const bankLine = input.slipBank ? `\nธนาคารที่ AI อ่านได้: **${input.slipBank}**` : "";

  const reviewAction = mismatch
    ? button(
        "❌ ยอดไม่ตรง — ไม่รับสลิปนี้",
        { action: "reject_payment_slip", case_id: input.caseId, slip_verdict: verdict },
        "danger",
      )
    : twoColumns(
        button(
          matches ? "✅ ยืนยันรับชำระ" : "✅ ตรวจเองแล้ว ยืนยันรับชำระ",
          { action: "confirm_slip_payment", case_id: input.caseId, slip_verdict: verdict },
          "primary_filled",
        ),
        button(
          "❌ ไม่ถูกต้อง",
          { action: "reject_payment_slip", case_id: input.caseId, slip_verdict: verdict },
          "danger",
        ),
      );

  return {
    schema: "2.0",
    config: {
      update_multi: true,
      width_mode: "fill",
      summary: { content: `ตรวจสอบสลิป • ต้องชำระ ฿${formatMoney(input.dealAmount)} • ในสลิป ${slipAmountText}` },
    },
    header: {
      template: mismatch ? "red" : matches ? "green" : "orange",
      title: { tag: "plain_text", content: "🧾 ตรวจสอบหลักฐานการชำระเงิน" },
    },
    body: {
      elements: [
        md(`${detection}\n\nยอดที่ต้องชำระ: **฿${formatMoney(input.dealAmount)}**\nยอดในสลิป: **${slipAmountText}**\n${comparison}${bankLine}\nAI confidence: **${confidence}**`),
        md("**สำคัญ:** AI ช่วยอ่านภาพและเทียบยอดเท่านั้น ไม่ได้ยืนยันธุรกรรมธนาคาร กรุณาตรวจชื่อผู้รับ ยอด และวันเวลาจากสลิปจริงก่อนกดรับชำระ"),
        reviewAction,
      ],
    },
  };
}

export function buildPaymentSlipAcceptedCard(amount: number): unknown {
  return terminalCard(
    "green",
    "✅ ยืนยันรับชำระแล้ว",
    `Sales ตรวจสอบหลักฐานและยืนยันรับชำระแล้ว\n**ยอด Closed Won ฿${formatMoney(amount)}**\nการ์ดนี้สิ้นสุดแล้ว ไม่มี action เพิ่ม`,
    `ยืนยันรับชำระ ฿${formatMoney(amount)} แล้ว`,
  );
}

export function buildPaymentSlipRejectedCard(): unknown {
  return terminalCard(
    "grey",
    "❌ หลักฐานการชำระเงินไม่ถูกต้อง",
    "Sales ตรวจสอบแล้วและ **ไม่รับรองสลิป/หลักฐานนี้**\nDeal, Customer และ Case จะไม่ถูกปิดยอดจากการ์ดนี้",
    "หลักฐานการชำระเงินไม่ถูกต้อง",
  );
}
