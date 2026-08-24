import type { AIAnalysisResult, ActionIntent, BuyerIntent, CustomerStage } from "./ai.types";

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function classify(text: string): { intent: ActionIntent; buyer: BuyerIntent; stage: CustomerStage; score: number } {
  const t = text.toLowerCase().trim();
  if (!t) return { intent: "unknown", buyer: "Just Browsing", stage: "New Lead", score: 5 };
  if (containsAny(t, ["สลิป", "โอนแล้ว", "ชำระแล้ว", "payment slip"])) return { intent: "payment_slip", buyer: "Ready To Buy", stage: "Closing", score: 98 };
  if (containsAny(t, ["qr", "คิวอาร์", "พร้อมเพย์", "ชำระเงิน", "จ่ายเงิน", "payment"])) return { intent: "payment_request", buyer: "Ready To Buy", stage: "Closing", score: 95 };
  if (containsAny(t, ["สั่ง", "เอา ", "รับ ", "ซื้อ", "order", "พร้อมโอน"])) return { intent: "product_order", buyer: "Ready To Buy", stage: "Closing", score: 92 };
  if (containsAny(t, ["ลดได้", "ส่วนลด", "ต่อราคา", "discount", "ลดราคา"])) return { intent: "ask_discount", buyer: "Purchase Intent", stage: "Negotiating", score: 82 };
  if (containsAny(t, ["ราคา", "เท่าไหร่", "กี่บาท", "price", "บาท", "ใบเสนอราคา", "quotation"])) return { intent: "ask_price", buyer: "Purchase Intent", stage: "Interested", score: 75 };
  if (containsAny(t, ["เดโม่", "demo", "สาธิต", "นัดดู", "นัดเดโม", "นัดเดโม่"])) return { intent: "demo_request", buyer: "Interested", stage: "Interested", score: 68 };
  if (containsAny(t, ["ส่งที่", "ที่อยู่", "จัดส่ง", "address", "delivery address"])) return { intent: "delivery_address", buyer: "Ready To Buy", stage: "Closing", score: 90 };
  if (containsAny(t, ["ส่งกี่วัน", "ส่งยังไง", "ค่าส่ง", "delivery", "จัดส่งไหม"])) return { intent: "delivery_question", buyer: "Interested", stage: "Interested", score: 60 };
  if (containsAny(t, ["สนใจ", "รายละเอียด", "มีของ", "รุ่น", "สินค้า", "product"])) return { intent: "product_info", buyer: "Interested", stage: "Interested", score: 62 };
  if (containsAny(t, ["ไม่เอาแล้ว", "ยกเลิก", "ไม่สนใจ", "cancel"])) return { intent: "lost", buyer: "Just Browsing", stage: "Lost", score: 0 };
  if (containsAny(t, ["ปัญหา", "เสีย", "เคลม", "ช่วย", "support", "เทคนิค", "technical"])) return { intent: "support", buyer: "Just Browsing", stage: "New Lead", score: 20 };
  if (/^(สวัสดี|หวัดดี|hello|hi|hey|ดีครับ|ดีค่ะ)/u.test(t)) return { intent: "greeting", buyer: "Just Browsing", stage: "New Lead", score: 15 };
  if (t.length < 8) return { intent: "small_talk", buyer: "Just Browsing", stage: "New Lead", score: 10 };
  return { intent: "general_inquiry", buyer: "Interested", stage: "New Lead", score: 35 };
}

export function analyzeByRules(text: string): AIAnalysisResult {
  const result = classify(text);
  return {
    intent: result.intent,
    buyer_intent: result.buyer,
    customer_stage: result.stage,
    lead_score: result.score,
    hot_lead: result.score >= 80,
    ai_summary: text.trim().slice(0, 240) || "ลูกค้าส่งข้อความ",
    provider: "rule_engine",
    confidence: result.score >= 80 ? 0.9 : result.score >= 60 ? 0.75 : 0.6,
  };
}
