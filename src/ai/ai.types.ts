export type ActionIntent =
  | "greeting"
  | "general_inquiry"
  | "ask_price"
  | "ask_discount"
  | "product_info"
  | "product_order"
  | "payment_request"
  | "payment_slip"
  | "delivery_address"
  | "delivery_question"
  | "demo_request"
  | "lost"
  | "support"
  | "small_talk"
  | "image_received"
  | "unknown";

export type BuyerIntent = "Just Browsing" | "Interested" | "Purchase Intent" | "Ready To Buy";
export type CustomerStage = "New Lead" | "Interested" | "Negotiating" | "Closing" | "Won" | "Lost";
export type AIProviderName = "rule_engine" | "workers_ai" | "safe_fallback";

export interface AIAnalysisResult {
  intent: ActionIntent;
  buyer_intent: BuyerIntent;
  customer_stage: CustomerStage;
  lead_score: number;
  hot_lead: boolean;
  ai_summary: string;
  product_name?: string;
  product_size?: string;
  quantity?: number;
  product_unit?: string;
  address?: string;
  phone?: string;
  provider?: AIProviderName;
  confidence?: number;
  image_ai?: ImageAnalysisResult;
}

export interface ImageAnalysisResult {
  image_type: "payment_slip" | "product_image" | "other_image" | "unknown";
  summary: string;
  slip_amount?: number;
  slip_bank?: string;
  confidence?: number;
}
