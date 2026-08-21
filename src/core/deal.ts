import type { QuoteDraft } from "./models";
import { roundMoney } from "../utils/money";

/**
 * Builds a minimal persisted snapshot when Sales closes a deal manually
 * without having sent a quotation first (for example: `ปิดยอด 45000`).
 * This keeps the three-table Base model intact while still giving the
 * Closed Won record an auditable amount/source snapshot.
 */
export function buildDirectCloseQuote(amount: number, reference: string): QuoteDraft {
  const normalized = roundMoney(amount);
  if (!(normalized > 0) || !Number.isFinite(normalized)) {
    throw new Error("Direct close amount must be greater than 0");
  }

  const quotationNo = reference.trim() || `DIRECT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  return {
    quotation_no: quotationNo,
    items: [
      {
        description: "Manual deal close",
        quantity: 1,
        unit_price: normalized,
        line_total: normalized,
      },
    ],
    discount: 0,
    vat_rate: 0,
    vat_amount: 0,
    shipping_fee: 0,
    subtotal: normalized,
    total_amount: normalized,
    note: "Created from confirmed manual close action; no quotation was sent.",
  };
}
