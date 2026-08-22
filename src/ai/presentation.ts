import type { AIAnalysisResult, ActionIntent } from "./ai.types";

export function intentLabel(intent: ActionIntent): string {
  switch (intent) {
    case "product_order": return "🎯 Buy Intent / Purchase Order";
    case "ask_price":
    case "ask_discount": return "💰 Price Inquiry / Quotation Request";
    case "support": return "🔧 Technical Support";
    case "demo_request": return "🧪 Demo Request";
    case "payment_request": return "💳 Payment Request";
    case "payment_slip": return "🧾 Payment Slip";
    case "product_info": return "📦 Product Inquiry";
    case "delivery_address":
    case "delivery_question": return "🚚 Delivery";
    case "lost": return "💤 Lost / Not Interested";
    default: return "💬 General Inquiry";
  }
}

export function leadQuality(score: number): string {
  if (score >= 80) return "🔥 Hot Lead";
  if (score >= 60) return "⚡ High Intent";
  return "🌱 New Lead";
}

export function actionGuidance(ai: Pick<AIAnalysisResult, "intent" | "lead_score">): string {
  switch (ai.intent) {
    case "ask_price":
    case "ask_discount": return "แนะนำ: รับเคสแล้วเปิดใบเสนอราคาเพื่อยืนยันราคาและเงื่อนไข";
    case "product_order": return "แนะนำ: ยืนยันสินค้า/จำนวน แล้วส่งใบเสนอราคาหรือ QR ตามขั้นตอน";
    case "payment_request": return "แนะนำ: ตรวจยอดใน Sales_Deals แล้วส่ง QR หลัง Preview/Confirm";
    case "payment_slip": return "แนะนำ: ตรวจสลิปและยอด จากนั้นใช้คำสั่งปิดยอดพร้อมยืนยันก่อน Closed Won";
    case "support": return "แนะนำ: ให้ Specialist/ทีมเทคนิคช่วยตอบใน Thread เดียวกัน";
    case "demo_request": return "แนะนำ: ยืนยันวันเวลาและผู้รับผิดชอบเดโม่ใน Thread";
    case "lost": return "แนะนำ: บันทึกเหตุผลและพิจารณา Re-target ในภายหลัง";
    default:
      return ai.lead_score >= 80
        ? "แนะนำ: ตอบกลับเร็วและพาลูกค้าเข้าสู่ขั้น Quote/Payment"
        : "แนะนำ: สอบถามความต้องการเพิ่มเติมก่อนเลือก Sales Action";
  }
}
