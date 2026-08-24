import type { QuoteDraft, QuoteItem } from "./models";
import { asNumber, asString, type UnknownRecord } from "../utils/json";
import { roundMoney } from "../utils/money";

export interface QuoteFormDefaults {
  defaultVatRate?: number;
}

function parseItem(form: UnknownRecord, index: number): QuoteItem | null {
  const description = asString(form[`item_${index}_description`]).trim();
  const quantity = asNumber(form[`item_${index}_quantity`], description ? 1 : 0);
  const unitPrice = asNumber(form[`item_${index}_unit_price`], 0);
  if (!description && quantity <= 0 && unitPrice <= 0) return null;
  if (!description) throw new Error(`รายการที่ ${index}: กรุณากรอกชื่อสินค้า/บริการ`);
  if (!(quantity > 0)) throw new Error(`รายการที่ ${index}: จำนวนต้องมากกว่า 0`);
  if (unitPrice < 0) throw new Error(`รายการที่ ${index}: ราคาต่อหน่วยต้องไม่ติดลบ`);
  return {
    description,
    quantity,
    unit_price: roundMoney(unitPrice),
    line_total: roundMoney(quantity * unitPrice),
  };
}

export function parseQuoteForm(form: UnknownRecord, defaults: QuoteFormDefaults = {}): QuoteDraft {
  const items: QuoteItem[] = [];
  for (let index = 1; index <= 5; index += 1) {
    const item = parseItem(form, index);
    if (item) items.push(item);
  }
  if (items.length === 0) throw new Error("กรุณากรอกอย่างน้อย 1 รายการ");

  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.line_total, 0));
  const discount = Math.max(0, roundMoney(asNumber(form.discount, 0)));
  const shippingFee = Math.max(0, roundMoney(asNumber(form.shipping_fee, 0)));
  const vatRate = Math.max(0, asNumber(form.vat_rate, defaults.defaultVatRate ?? 0));
  const taxable = Math.max(0, roundMoney(subtotal - discount));
  const vatAmount = roundMoney((taxable * vatRate) / 100);
  const totalAmount = roundMoney(taxable + vatAmount + shippingFee);
  if (totalAmount < 0) throw new Error("ยอดรวมไม่ถูกต้อง");

  const quotationNo = asString(form.quotation_no).trim() || `QT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  return {
    quotation_no: quotationNo,
    items,
    discount,
    vat_rate: vatRate,
    vat_amount: vatAmount,
    shipping_fee: shippingFee,
    subtotal,
    total_amount: totalAmount,
    note: asString(form.note).trim() || undefined,
    valid_until: asString(form.valid_until).trim() || undefined,
  };
}
