import type { QuoteDraft } from "../../core/models";
import { formatMoney } from "../../utils/money";

export function buildQuoteSentCard(quote: QuoteDraft): unknown {
  const lines = quote.items
    .map((item) => `• ${item.description} — ${item.quantity} × ฿${formatMoney(item.unit_price)} = ฿${formatMoney(item.line_total)}`)
    .join("\n");

  return {
    schema: "2.0",
    config: {
      update_multi: false,
      width_mode: "fill",
      summary: { content: `${quote.quotation_no} ส่ง LINE แล้ว • ฿${formatMoney(quote.total_amount)}`.slice(0, 200) },
    },
    header: {
      template: "green",
      title: { tag: "plain_text", content: "✅ ส่งใบเสนอราคาแล้ว" },
    },
    body: {
      elements: [
        {
          tag: "markdown",
          content: `**${quote.quotation_no}**\n${lines}\n\nSubtotal ฿${formatMoney(quote.subtotal)}\nDiscount ฿${formatMoney(quote.discount)}\nVAT ${quote.vat_rate}% = ฿${formatMoney(quote.vat_amount)}\nShipping ฿${formatMoney(quote.shipping_fee)}\n**รวมสุทธิ ฿${formatMoney(quote.total_amount)}**\n\n✅ **บันทึก Sales_Deals และส่งเข้า LINE สำเร็จแล้ว**`,
        },
      ],
    },
  };
}
