import { formatMoney } from "../../utils/money";

export interface PaymentSlipReviewCardInput {
  caseId: string;
  dealAmount: number;
  slipAmount?: number;
  slipBank?: string;
  confidence?: number;
  aiDetected: boolean;
}

function md(content: string): unknown {
  return { tag: "markdown", content };
}

function callback(value: Record<string, string>): unknown {
  return { type: "callback", value };
}

function button(label: string, value: Record<string, string>): unknown {
  return {
    tag: "button",
    text: { tag: "plain_text", content: label },
    type: "primary_filled",
    width: "fill",
    behaviors: [callback(value)],
  };
}

export function buildPaymentSlipReviewCard(input: PaymentSlipReviewCardInput): unknown {
  const hasSlipAmount = typeof input.slipAmount === "number" && Number.isFinite(input.slipAmount) && input.slipAmount >= 0;
  const mismatch = hasSlipAmount && input.dealAmount > 0 && Math.abs((input.slipAmount ?? 0) - input.dealAmount) > 0.01;
  const confidence = typeof input.confidence === "number" && Number.isFinite(input.confidence)
    ? `${Math.round(Math.max(0, Math.min(1, input.confidence)) * 100)}%`
    : "-";

  const detection = input.aiDetected
    ? "🤖 AI ตรวจพบว่า **น่าจะเป็นสลิป/หลักฐานการชำระเงิน**"
    : "🧾 ได้รับรูปในเคสที่อยู่ขั้น **Payment** — กรุณาตรวจว่าเป็นสลิป/หลักฐานการชำระเงินหรือไม่";
  const amountLine = hasSlipAmount
    ? `ยอดที่ AI อ่านจากสลิป: **฿${formatMoney(input.slipAmount ?? 0)}**`
    : "ยอดจากสลิป: **AI ยังอ่านไม่ได้ — ให้ตรวจจากภาพจริง**";
  const comparison = mismatch
    ? `⚠️ **ยอดในสลิปไม่ตรง Deal** (Deal ฿${formatMoney(input.dealAmount)})`
    : hasSlipAmount
      ? `✅ ยอดที่ AI อ่าน **ตรงกับ Deal ฿${formatMoney(input.dealAmount)}**`
      : `ยอด Deal ปัจจุบัน: **฿${formatMoney(input.dealAmount)}**`;
  const bankLine = input.slipBank ? `ธนาคารที่ AI อ่านได้: **${input.slipBank}**` : "";

  return {
    schema: "2.0",
    config: {
      update_multi: true,
      width_mode: "fill",
      summary: { content: `ตรวจสอบสลิปก่อนยืนยันรับชำระ • Deal ฿${formatMoney(input.dealAmount)}` },
    },
    header: {
      template: mismatch ? "red" : "orange",
      title: { tag: "plain_text", content: "🧾 ตรวจสอบหลักฐานการชำระเงิน" },
    },
    body: {
      elements: [
        md(`${detection}\n${amountLine}\n${comparison}${bankLine ? `\n${bankLine}` : ""}\nAI confidence: **${confidence}**`),
        md("**สำคัญ:** AI ไม่ได้ยืนยันธุรกรรมธนาคารและจะไม่ปิดยอดอัตโนมัติ กรุณาตรวจภาพสลิปจริง ชื่อผู้รับ ยอด และวันเวลาให้ถูกต้องก่อนกดดำเนินการต่อ"),
        button("✅ ตรวจสอบแล้ว → ยืนยันรับชำระ", { action: "close_deal_prompt", case_id: input.caseId }),
      ],
    },
  };
}
