import type { AIAnalysisResult } from "../../ai/ai.types";
import type { CampaignDraft, CaseRoute, QuoteDraft, SalesPerformance } from "../../core/models";
import { formatMoney } from "../../utils/money";

function md(content: string): unknown { return { tag: "div", text: { tag: "lark_md", content } }; }
function button(label: string, value: Record<string, unknown>, type: "primary" | "default" | "danger" = "default"): unknown {
  return { tag: "button", text: { tag: "plain_text", content: label }, type, value };
}
function actions(items: unknown[]): unknown { return { tag: "action", actions: items }; }

export function buildCaseCard(input: {
  route: CaseRoute;
  customerName: string;
  latestMessage: string;
  ai: AIAnalysisResult;
  dealAmount?: number;
  performance?: SalesPerformance;
}): unknown {
  const { route, customerName, ai } = input;
  const resolved = route.status === "RESOLVED";
  const won = route.status === "WON" || resolved && (input.dealAmount ?? 0) > 0;
  const template = resolved ? "grey" : won ? "turquoise" : route.owner_open_id ? "green" : "blue";
  const title = resolved ? `RESOLVED | ${customerName}` : route.owner_open_id ? `LINE | ${customerName} • ดูแลโดย ${route.owner_name ?? "Sales"}` : `LINE | ${customerName}`;
  const lead = `${ai.hot_lead ? "🔥 Hot Lead" : "Lead"} • 🎯 ${ai.buyer_intent}`;
  const elements: unknown[] = [
    md(`**${lead}**\nAI Intent: **${ai.intent}** • Score: **${Math.round(ai.lead_score)}**\n${ai.ai_summary ? `🤖 ${ai.ai_summary}` : ""}`),
    md(`💬 **ข้อความล่าสุด**\n${input.latestMessage || "-"}`),
  ];
  if (route.owner_open_id) elements.push(md(`👤 **Owner:** ${route.owner_name ?? route.owner_open_id}`));
  if (input.dealAmount !== undefined) elements.push(md(`💰 **Deal:** ฿${formatMoney(input.dealAmount)}`));

  if (resolved) {
    const firstResponse = route.first_response_at ? Math.max(0, Math.round((route.first_response_at - route.opened_at) / 1000)) : null;
    const resolution = route.closed_at ? Math.max(0, Math.round((route.closed_at - route.opened_at) / 1000)) : null;
    const perf = input.performance;
    elements.push(md(`⚡ **First Response:** ${firstResponse === null ? "-" : `${firstResponse} วินาที`}\n⏱ **Resolution:** ${resolution === null ? "-" : `${resolution} วินาที`}\n📊 **Sales Performance:** ${perf ? `฿${formatMoney(perf.closed_won_amount)} / ${perf.closed_won_count} ดีล` : "-"}`));
  } else if (!route.owner_open_id) {
    elements.push(actions([button("🙋‍♂️ รับเคสนี้", { action: "claim_case", case_id: route.case_id }, "primary")]));
  } else {
    elements.push(actions([
      button("🎨 ส่งใบเสนอราคา", { action: "open_quote_form", case_id: route.case_id }, "primary"),
      button("💳 ส่ง QR ชำระเงิน", { action: "open_qr_form", case_id: route.case_id }),
    ]));
    elements.push(actions([
      button("💰 ปิดการขาย", { action: "close_deal_prompt", case_id: route.case_id }),
      button("📣 Re-target", { action: "open_campaign_form", segment: "retarget", case_id: route.case_id }),
      button("✅ ปิดเคสนี้", { action: "close_case", case_id: route.case_id }, "danger"),
    ]));
  }
  return { config: { wide_screen_mode: true, update_multi: true }, header: { template, title: { tag: "plain_text", content: title } }, elements };
}

function input(name: string, placeholder: string, defaultValue = ""): unknown {
  const item: Record<string, unknown> = { tag: "input", name, placeholder: { tag: "plain_text", content: placeholder } };
  if (defaultValue) item.default_value = defaultValue;
  return item;
}

export function buildQuoteFormCard(caseId: string, defaultVatRate = 7): unknown {
  const formElements: unknown[] = [input("quotation_no", "เลขที่ใบเสนอราคา (เว้นว่างให้ระบบตั้งให้)")];
  for (let index = 1; index <= 5; index += 1) {
    formElements.push(md(`**รายการ ${index}**`), input(`item_${index}_description`, "สินค้า/บริการ"), input(`item_${index}_quantity`, "จำนวน"), input(`item_${index}_unit_price`, "ราคาต่อหน่วย"));
  }
  formElements.push(input("discount", "ส่วนลด", "0"), input("vat_rate", "VAT %", String(defaultVatRate)), input("shipping_fee", "ค่าจัดส่ง", "0"), input("valid_until", "ใช้ได้ถึง เช่น 2026-08-31"), input("note", "หมายเหตุ"));
  formElements.push(actions([{
    tag: "button", type: "primary", action_type: "form_submit", name: "submit_quote_preview",
    text: { tag: "plain_text", content: "ดูตัวอย่างใบเสนอราคา" }, value: { action: "submit_quote_preview", case_id: caseId },
  }]));
  return { config: { wide_screen_mode: true }, header: { template: "blue", title: { tag: "plain_text", content: "🎨 กรอกใบเสนอราคา" } }, elements: [{ tag: "form", name: "quote_form", elements: formElements }] };
}

export function buildQuotePreviewCard(caseId: string, draftId: string, quote: QuoteDraft): unknown {
  const lines = quote.items.map((item) => `• ${item.description} — ${item.quantity} × ฿${formatMoney(item.unit_price)} = ฿${formatMoney(item.line_total)}`).join("\n");
  return {
    config: { wide_screen_mode: true }, header: { template: "orange", title: { tag: "plain_text", content: "ตรวจสอบใบเสนอราคา" } },
    elements: [md(`**${quote.quotation_no}**\n${lines}\n\nSubtotal ฿${formatMoney(quote.subtotal)}\nDiscount ฿${formatMoney(quote.discount)}\nVAT ${quote.vat_rate}% = ฿${formatMoney(quote.vat_amount)}\nShipping ฿${formatMoney(quote.shipping_fee)}\n**รวมสุทธิ ฿${formatMoney(quote.total_amount)}**`), actions([
      button("✅ ยืนยันบันทึก + ส่ง LINE", { action: "confirm_quote", case_id: caseId, draft_id: draftId }, "primary"),
      button("❌ ยกเลิก", { action: "cancel_draft", draft_id: draftId }),
    ])],
  };
}

export function buildPaymentFormCard(caseId: string, amount: number): unknown {
  return { config: { wide_screen_mode: true }, header: { template: "purple", title: { tag: "plain_text", content: "💳 ส่ง QR ชำระเงิน" } }, elements: [
    md(`ยอดจากใบเสนอราคาล่าสุด: **฿${formatMoney(amount)}**\nตรวจสอบหรือแก้ยอดก่อนส่ง`),
    { tag: "form", name: "payment_form", elements: [input("amount", "ยอดชำระ", String(amount)), input("note", "รายละเอียด/หมายเหตุ"), actions([{ tag: "button", type: "primary", action_type: "form_submit", name: "submit_qr_preview", text: { tag: "plain_text", content: "ดูตัวอย่าง QR" }, value: { action: "submit_qr_preview", case_id: caseId } }])] },
  ] };
}

export function buildPaymentPreviewCard(caseId: string, draftId: string, amount: number, note?: string): unknown {
  return { config: { wide_screen_mode: true }, header: { template: "orange", title: { tag: "plain_text", content: "ตรวจสอบยอดชำระ" } }, elements: [md(`ยอดที่จะสร้าง PromptPay QR: **฿${formatMoney(amount)}**${note ? `\n${note}` : ""}`), actions([
    button("✅ ยืนยันสร้าง + ส่ง LINE", { action: "confirm_qr", case_id: caseId, draft_id: draftId }, "primary"),
    button("❌ ยกเลิก", { action: "cancel_draft", draft_id: draftId }),
  ])] };
}

export function buildCloseDealConfirmCard(caseId: string, draftId: string, amount: number): unknown {
  return { config: { wide_screen_mode: true }, header: { template: "orange", title: { tag: "plain_text", content: "ยืนยันปิดการขาย" } }, elements: [md(`บันทึก Closed Won **฿${formatMoney(amount)}** และส่ง Payment Confirmation เข้า LINE ลูกค้า?`), actions([
    button("🏆 ยืนยันปิดยอด", { action: "confirm_close_deal", case_id: caseId, draft_id: draftId }, "primary"),
    button("ยกเลิก", { action: "cancel_draft", draft_id: draftId }),
  ])] };
}

export function buildCampaignFormCard(caseId: string, segment: "vip" | "retarget"): unknown {
  return { config: { wide_screen_mode: true }, header: { template: "purple", title: { tag: "plain_text", content: `📣 โปร ${segment.toUpperCase()}` } }, elements: [
    { tag: "form", name: "campaign_form", elements: [input("title", "ชื่อโปรโมชัน"), input("detail", "รายละเอียด"), input("coupon_code", "โค้ดคูปอง (ถ้ามี)"), input("cta_label", "ข้อความปุ่ม เช่น ดูโปร"), input("cta_url", "URL ปุ่ม (HTTPS)"), input("valid_until", "ใช้ได้ถึง"), actions([{ tag: "button", type: "primary", action_type: "form_submit", name: "submit_campaign_preview", text: { tag: "plain_text", content: "ตรวจกลุ่ม + Preview" }, value: { action: "submit_campaign_preview", case_id: caseId, segment } }])] },
  ] };
}

export function buildCampaignPreviewCard(caseId: string, draftId: string, campaign: CampaignDraft, count: number): unknown {
  return { config: { wide_screen_mode: true }, header: { template: "orange", title: { tag: "plain_text", content: "Campaign Preview" } }, elements: [md(`Segment: **${campaign.segment}**\nMatched LINE users: **${count}**\n\n**${campaign.title}**\n${campaign.detail}${campaign.coupon_code ? `\n🎟 ${campaign.coupon_code}` : ""}`), actions([
    button("🚀 ยืนยันยิง", { action: "confirm_campaign", case_id: caseId, draft_id: draftId }, "primary"),
    button("ยกเลิก", { action: "cancel_draft", draft_id: draftId }),
  ])] };
}
