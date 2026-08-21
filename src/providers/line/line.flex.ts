import type { CampaignDraft, QuoteDraft } from "../../core/models";
import type { LineFlexMessage } from "./line.provider";
import { formatMoney } from "../../utils/money";

function text(text: string, options: Record<string, unknown> = {}): unknown {
  return { type: "text", text, wrap: true, ...options };
}

export function quotationFlex(company: string, customerName: string, quote: QuoteDraft): LineFlexMessage {
  const itemContents = quote.items.flatMap((item) => [
    { type: "box", layout: "horizontal", contents: [text(item.description, { flex: 5, size: "sm" }), text(`${item.quantity} × ฿${formatMoney(item.unit_price)}`, { flex: 3, size: "sm", align: "end" })] },
    text(`฿${formatMoney(item.line_total)}`, { size: "sm", align: "end", color: "#666666" }),
  ]);
  return {
    type: "flex",
    altText: `ใบเสนอราคา ${quote.quotation_no} ฿${formatMoney(quote.total_amount)}`,
    contents: {
      type: "bubble",
      header: { type: "box", layout: "vertical", contents: [text(company, { weight: "bold", size: "lg" }), text("ใบเสนอราคา", { size: "xl", weight: "bold" }), text(quote.quotation_no, { size: "sm", color: "#666666" })] },
      body: { type: "box", layout: "vertical", spacing: "md", contents: [text(`เรียน ${customerName}`, { size: "sm" }), ...itemContents,
        { type: "separator" },
        text(`Subtotal  ฿${formatMoney(quote.subtotal)}`, { align: "end", size: "sm" }),
        ...(quote.discount ? [text(`Discount  -฿${formatMoney(quote.discount)}`, { align: "end", size: "sm" })] : []),
        ...(quote.vat_amount ? [text(`VAT ${quote.vat_rate}%  ฿${formatMoney(quote.vat_amount)}`, { align: "end", size: "sm" })] : []),
        ...(quote.shipping_fee ? [text(`Shipping  ฿${formatMoney(quote.shipping_fee)}`, { align: "end", size: "sm" })] : []),
        text(`ยอดสุทธิ  ฿${formatMoney(quote.total_amount)}`, { align: "end", weight: "bold", size: "lg" }),
        ...(quote.valid_until ? [text(`ใช้ได้ถึง ${quote.valid_until}`, { size: "xs", color: "#888888" })] : []),
        ...(quote.note ? [text(quote.note, { size: "xs", color: "#666666" })] : []),
      ] },
    },
  };
}

export function paymentFlex(company: string, amount: number, note?: string): LineFlexMessage {
  return {
    type: "flex",
    altText: `QR ชำระเงิน ฿${formatMoney(amount)}`,
    contents: { type: "bubble", header: { type: "box", layout: "vertical", contents: [text(company, { weight: "bold" }), text("ชำระเงิน PromptPay", { weight: "bold", size: "xl" })] }, body: { type: "box", layout: "vertical", spacing: "md", contents: [text(`ยอดชำระ`, { color: "#666666" }), text(`฿${formatMoney(amount)}`, { size: "xxl", weight: "bold" }), ...(note ? [text(note, { size: "sm" })] : []), text("แตะ/บันทึกรูป QR ที่ส่งถัดไปเพื่อสแกนชำระ และตรวจสอบยอดก่อนยืนยันในแอปธนาคาร", { size: "xs", color: "#777777" })] } },
  };
}

export function paymentConfirmationFlex(company: string, amount: number): LineFlexMessage {
  return {
    type: "flex",
    altText: `ยืนยันรับชำระ ฿${formatMoney(amount)}`,
    contents: { type: "bubble", header: { type: "box", layout: "vertical", contents: [text(company, { weight: "bold" }), text("✅ Payment Confirmation", { size: "xl", weight: "bold" })] }, body: { type: "box", layout: "vertical", spacing: "md", contents: [text("เราได้รับการยืนยันยอดชำระแล้ว"), text(`฿${formatMoney(amount)}`, { size: "xxl", weight: "bold" }), text("ข้อความนี้เป็นการยืนยันการรับชำระในระบบ CRM ไม่ใช่ใบกำกับภาษี เว้นแต่บริษัทจะเชื่อมระบบเอกสารภาษีเพิ่มเติม", { size: "xs", color: "#777777", wrap: true })] } },
  };
}

export function campaignFlex(company: string, campaign: CampaignDraft): LineFlexMessage {
  const footerContents: unknown[] = [];
  if (campaign.cta_url?.startsWith("https://")) footerContents.push({ type: "button", style: "primary", action: { type: "uri", label: campaign.cta_label || "ดูโปร", uri: campaign.cta_url } });
  return {
    type: "flex", altText: campaign.title.slice(0, 400),
    contents: { type: "bubble", header: { type: "box", layout: "vertical", contents: [text(company, { weight: "bold" }), text(campaign.title, { size: "xl", weight: "bold" })] }, body: { type: "box", layout: "vertical", spacing: "md", contents: [text(campaign.detail), ...(campaign.coupon_code ? [text(`🎟 Code: ${campaign.coupon_code}`, { weight: "bold" })] : []), ...(campaign.valid_until ? [text(`ใช้ได้ถึง ${campaign.valid_until}`, { size: "xs", color: "#777777" })] : [])] }, ...(footerContents.length ? { footer: { type: "box", layout: "vertical", contents: footerContents } } : {}) },
  };
}
