import type { AIAnalysisResult } from "../../ai/ai.types";
import { actionGuidance, intentLabel, leadQuality } from "../../ai/presentation";
import type { CampaignDraft, CaseRoute, QuoteDraft, SalesPerformance } from "../../core/models";
import { calculateSla, formatDuration } from "../../core/sla";
import { formatMoney } from "../../utils/money";

type CardHeaderTemplate = "blue" | "green" | "grey" | "turquoise" | "orange" | "purple";
type CardButtonType = "default" | "primary" | "danger" | "primary_filled" | "danger_filled";
type FormValues = Record<string, unknown>;
export type DraftCardKind = "quote" | "payment" | "close_deal" | "campaign";

function md(content: string): unknown {
  return { tag: "markdown", content };
}

function callback(value: Record<string, string>): unknown {
  return { type: "callback", value };
}

function button(label: string, value: Record<string, string>, type: CardButtonType = "default"): unknown {
  return {
    tag: "button",
    text: { tag: "plain_text", content: label },
    type,
    width: "fill",
    behaviors: [callback(value)],
  };
}

function submitButton(
  label: string,
  name: string,
  value: Record<string, string>,
  type: CardButtonType = "primary_filled",
): unknown {
  return {
    tag: "button",
    text: { tag: "plain_text", content: label },
    type,
    width: "fill",
    name,
    form_action_type: "submit",
    behaviors: [callback(value)],
  };
}

function input(name: string, placeholder: string, defaultValue = "", required = false): unknown {
  const item: Record<string, unknown> = {
    tag: "input",
    name,
    required,
    width: "fill",
    input_type: "text",
    placeholder: { tag: "plain_text", content: placeholder },
  };
  if (defaultValue) item.default_value = defaultValue;
  return item;
}

function formDefault(values: FormValues, name: string, fallback = ""): string {
  const value = values[name];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function card(
  template: CardHeaderTemplate,
  title: string,
  elements: unknown[],
  summary: string,
  updateMulti = true,
): unknown {
  return {
    schema: "2.0",
    config: {
      update_multi: updateMulti,
      width_mode: "fill",
      summary: { content: summary.slice(0, 200) },
    },
    header: {
      template,
      title: { tag: "plain_text", content: title },
    },
    body: { elements },
  };
}

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
  const won = route.status === "WON" || (resolved && (input.dealAmount ?? 0) > 0);
  const template: CardHeaderTemplate = resolved ? "grey" : won ? "turquoise" : route.owner_open_id ? "green" : "blue";
  const title = resolved
    ? `⚪ [LINE Client] ${customerName} (ปิดเคสแล้ว)${route.owner_name ? ` โดย ${route.owner_name}` : ""}`
    : route.status === "WON"
      ? `🏆 [LINE Client] ${customerName}`
      : route.owner_open_id
        ? `🟢 [LINE Client] ${customerName} (ดูแลโดย: ${route.owner_name ?? "Sales"})`
        : `💬 [LINE Client] ${customerName}`;
  const elements: unknown[] = [
    md(`**${leadQuality(ai.lead_score)} • ${intentLabel(ai.intent)}**\nBuyer Intent: **${ai.buyer_intent}** • Score: **${Math.round(ai.lead_score)}**\n${ai.ai_summary ? `🤖 ${ai.ai_summary}` : ""}`),
    md(`💡 **AI Sales Copilot**\n${actionGuidance(ai)}`),
    md(`💬 **ข้อความล่าสุด**\n${input.latestMessage || "-"}`),
  ];

  if (route.owner_open_id) {
    elements.push(md(`👤 **Case Owner:** ${route.owner_name ?? route.owner_open_id}\nสมาชิกทีมใน Thread สามารถช่วยตอบลูกค้าได้ แต่ Owner ยังคงเป็นผู้รับผิดชอบ KPI / Deal`));
  }
  if (input.dealAmount !== undefined) elements.push(md(`💰 **Deal:** ฿${formatMoney(input.dealAmount)}`));

  if (resolved) {
    const sla = calculateSla(route);
    const perf = input.performance;
    elements.push(md(`⚡ **Case SLA:** ${formatDuration(sla.first_response_seconds)} • ${sla.sla_status}\n⏱ **Resolution:** ${formatDuration(sla.resolution_seconds)}\n📊 **Sales Performance:** ${perf ? `฿${formatMoney(perf.closed_won_amount)} / ${perf.closed_won_count} ดีล` : "-"}`));
  } else if (!route.owner_open_id) {
    elements.push(button("🙋‍♂️ รับเคสนี้", { action: "claim_case", case_id: route.case_id }, "primary_filled"));
  } else if (route.status === "WON") {
    elements.push(md("🏆 **Closed Won** — ปิดยอดแล้ว รอปิดเคสเพื่อสรุป SLA / Performance"));
    elements.push(button("✅ ปิดเคสนี้", { action: "close_case", case_id: route.case_id }, "primary_filled"));
  } else {
    elements.push(
      button("🎨 ส่งใบเสนอราคา (Flex)", { action: "open_quote_form", case_id: route.case_id }, "primary_filled"),
      button("💳 ส่ง QR ชำระเงิน", { action: "open_qr_form", case_id: route.case_id }),
      button("💰 ปิดการขายสำเร็จ", { action: "close_deal_prompt", case_id: route.case_id }),
      button("📢 ยิงโปร Re-target", { action: "open_campaign_form", segment: "retarget", case_id: route.case_id }),
      button("✅ ปิดเคสนี้ (Resolved)", { action: "close_case", case_id: route.case_id }, "danger"),
    );
  }

  return card(template, title, elements, `${customerName}: ${input.latestMessage || ai.ai_summary || route.status}`, true);
}

export function buildThreadGuardWarningCard(): unknown {
  return card(
    "orange",
    "⚠️ ข้อความนี้ไม่ได้ส่งไป LINE",
    [md("เพื่อป้องกันส่งผิดลูกค้า ระบบ **ไม่ส่งข้อความจากช่องแชทรวม** ไป LINE โดยเด็ดขาด\nกรุณาเปิด Case Card ของลูกค้าที่ต้องการ แล้วกด **Reply in Thread** ก่อนพิมพ์ตอบ")],
    "ข้อความในแชทรวมไม่ได้ส่งไป LINE — กรุณา Reply in Thread",
    false,
  );
}

export function buildQuoteFormCard(
  caseId: string,
  defaultVatRate = 7,
  itemCount = 1,
  values: FormValues = {},
): unknown {
  const count = Math.max(1, Math.min(5, Math.round(itemCount)));
  const formElements: unknown[] = [
    md("**เลขที่ใบเสนอราคา**"),
    input("quotation_no", "เว้นว่างให้ระบบตั้งให้", formDefault(values, "quotation_no")),
  ];
  for (let index = 1; index <= count; index += 1) {
    formElements.push(
      md(`**รายการ ${index}**`),
      md("สินค้า/บริการ"),
      input(`item_${index}_description`, "ชื่อสินค้า/บริการ", formDefault(values, `item_${index}_description`)),
      md("จำนวน"),
      input(`item_${index}_quantity`, "จำนวน", formDefault(values, `item_${index}_quantity`, "1")),
      md("ราคาต่อหน่วย (บาท)"),
      input(`item_${index}_unit_price`, "ราคาต่อหน่วย", formDefault(values, `item_${index}_unit_price`)),
    );
  }
  if (count < 5) {
    formElements.push(
      submitButton(
        "➕ เพิ่มรายการ",
        "quote_add_item",
        { action: "quote_add_item", case_id: caseId, item_count: String(count) },
        "default",
      ),
    );
  }
  formElements.push(
    md("**ส่วนลด (บาท)**"),
    input("discount", "ส่วนลด", formDefault(values, "discount", "0")),
    md("**VAT (%)**"),
    input("vat_rate", "VAT %", formDefault(values, "vat_rate", String(defaultVatRate))),
    md("**ค่าจัดส่ง (บาท)**"),
    input("shipping_fee", "ค่าจัดส่ง", formDefault(values, "shipping_fee", "0")),
    md("**ใช้ได้ถึง**"),
    input("valid_until", "เช่น 2026-08-31", formDefault(values, "valid_until")),
    md("**หมายเหตุ**"),
    input("note", "หมายเหตุ", formDefault(values, "note")),
    submitButton("ดูตัวอย่างใบเสนอราคา", "submit_quote_preview", { action: "submit_quote_preview", case_id: caseId }),
  );
  return card(
    "blue",
    "🎨 กรอกใบเสนอราคา",
    [{ tag: "form", name: "quote_form", elements: formElements }],
    `กรอกใบเสนอราคา ${count} รายการและตรวจสอบก่อนส่ง LINE`,
  );
}

export function buildQuotePreviewCard(caseId: string, draftId: string, quote: QuoteDraft): unknown {
  const lines = quote.items.map((item) => `• ${item.description} — ${item.quantity} × ฿${formatMoney(item.unit_price)} = ฿${formatMoney(item.line_total)}`).join("\n");
  return card(
    "orange",
    "ตรวจสอบใบเสนอราคา",
    [
      md(`**${quote.quotation_no}**\n${lines}\n\nSubtotal ฿${formatMoney(quote.subtotal)}\nDiscount ฿${formatMoney(quote.discount)}\nVAT ${quote.vat_rate}% = ฿${formatMoney(quote.vat_amount)}\nShipping ฿${formatMoney(quote.shipping_fee)}\n**รวมสุทธิ ฿${formatMoney(quote.total_amount)}**`),
      button("✅ ยืนยันบันทึก + ส่ง LINE", { action: "confirm_quote", case_id: caseId, draft_id: draftId }, "primary_filled"),
      button("❌ ยกเลิก", { action: "cancel_draft", draft_id: draftId }),
    ],
    `${quote.quotation_no} • ฿${formatMoney(quote.total_amount)}`,
  );
}

export function buildPaymentFormCard(caseId: string, amount: number): unknown {
  return card(
    "purple",
    "💳 ส่ง QR ชำระเงิน",
    [
      md(`ยอดจากใบเสนอราคาล่าสุด: **฿${formatMoney(amount)}**\nตรวจสอบหรือแก้ยอดก่อนส่ง`),
      {
        tag: "form",
        name: "payment_form",
        elements: [
          input("amount", "ยอดชำระ", String(amount), true),
          input("note", "รายละเอียด/หมายเหตุ"),
          submitButton("ดูตัวอย่าง QR", "submit_qr_preview", { action: "submit_qr_preview", case_id: caseId }),
        ],
      },
    ],
    `QR ชำระเงิน ฿${formatMoney(amount)}`,
  );
}

export function buildPaymentPreviewCard(caseId: string, draftId: string, amount: number, note?: string): unknown {
  return card(
    "orange",
    "ตรวจสอบยอดชำระ",
    [
      md(`ยอดที่จะสร้าง PromptPay QR: **฿${formatMoney(amount)}**${note ? `\n${note}` : ""}`),
      button("✅ ยืนยันสร้าง + ส่ง LINE", { action: "confirm_qr", case_id: caseId, draft_id: draftId }, "primary_filled"),
      button("❌ ยกเลิก", { action: "cancel_draft", draft_id: draftId }),
    ],
    `ตรวจสอบยอด PromptPay ฿${formatMoney(amount)}`,
  );
}

export function buildCloseDealConfirmCard(caseId: string, draftId: string, amount: number): unknown {
  return card(
    "orange",
    "ยืนยันปิดการขาย",
    [
      md(`บันทึก Closed Won **฿${formatMoney(amount)}** และส่ง Payment Confirmation เข้า LINE ลูกค้า?`),
      button("🏆 ยืนยันปิดยอด", { action: "confirm_close_deal", case_id: caseId, draft_id: draftId }, "primary_filled"),
      button("ยกเลิก", { action: "cancel_draft", draft_id: draftId }),
    ],
    `ยืนยัน Closed Won ฿${formatMoney(amount)}`,
  );
}

export function buildCampaignSegmentMenuCard(caseId: string): unknown {
  return card(
    "purple",
    "📢 เลือกกลุ่ม Broadcast",
    [
      md("เลือก Segment ก่อน ระบบจะ Query ลูกค้า → Preview จำนวนผู้รับ → ต้องยืนยันอีกครั้งก่อนส่ง"),
      button("💎 VIP", { action: "open_campaign_form", case_id: caseId, segment: "vip" }, "primary_filled"),
      button("🎯 Re-target", { action: "open_campaign_form", case_id: caseId, segment: "retarget" }),
    ],
    "เลือกกลุ่ม Broadcast",
  );
}

export function buildCampaignFormCard(caseId: string, segment: "vip" | "retarget"): unknown {
  return card(
    "purple",
    `📣 โปร ${segment.toUpperCase()}`,
    [
      {
        tag: "form",
        name: "campaign_form",
        elements: [
          input("title", "ชื่อโปรโมชัน", "", true),
          input("detail", "รายละเอียด", "", true),
          input("coupon_code", "โค้ดคูปอง (ถ้ามี)"),
          input("cta_label", "ข้อความปุ่ม เช่น ดูโปร"),
          input("cta_url", "URL ปุ่ม (HTTPS)"),
          input("valid_until", "ใช้ได้ถึง"),
          submitButton("ตรวจกลุ่ม + Preview", "submit_campaign_preview", { action: "submit_campaign_preview", case_id: caseId, segment }),
        ],
      },
    ],
    `กรอก Campaign ${segment.toUpperCase()} ก่อน Preview`,
  );
}

export function buildCampaignPreviewCard(caseId: string, draftId: string, campaign: CampaignDraft, count: number): unknown {
  return card(
    "orange",
    "Campaign Preview",
    [
      md(`Segment: **${campaign.segment}**\nMatched / reachable-format LINE users: **${count}**\n\n**${campaign.title}**\n${campaign.detail}${campaign.coupon_code ? `\n🎟 ${campaign.coupon_code}` : ""}`),
      button("🚀 ยืนยันยิง", { action: "confirm_campaign", case_id: caseId, draft_id: draftId }, "primary_filled"),
      button("ยกเลิก", { action: "cancel_draft", draft_id: draftId }),
    ],
    `${campaign.title} • ${count} LINE users`,
  );
}

export function buildCancelledDraftCard(kind: DraftCardKind): unknown {
  const labels: Record<DraftCardKind, string> = {
    quote: "ใบเสนอราคา",
    payment: "QR ชำระเงิน",
    close_deal: "การปิดการขาย",
    campaign: "Campaign",
  };
  const label = labels[kind];
  return card(
    "grey",
    `⚪ ${label} — ยกเลิกแล้ว`,
    [md(`รายการ **${label}** นี้ถูกยกเลิกแล้ว\nไม่มีการส่ง LINE และไม่มี action ที่ใช้งานได้ต่อจากการ์ดใบนี้`) ],
    `${label} ยกเลิกแล้ว`,
    false,
  );
}
