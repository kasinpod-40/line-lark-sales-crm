import type { AIAnalysisResult } from "../ai/ai.types";

export type CaseStatus = "NEW" | "CLAIMED" | "IN_PROGRESS" | "QUOTED" | "PAYMENT" | "WON" | "RESOLVED";
export type TrackingRecordType = "CASE" | "MESSAGE";
export type MessageDirection = "customer_to_sales" | "sales_to_customer";

export interface CaseRoute {
  case_id: string;
  line_user_id: string;
  customer_id: string;
  customer_record_id: string | null;
  tracking_record_id: string | null;
  root_message_id: string | null;
  thread_id: string | null;
  owner_open_id: string | null;
  owner_name: string | null;
  status: CaseStatus;
  opened_at: number;
  claimed_at: number | null;
  first_response_at: number | null;
  closed_at: number | null;
  latest_line_message_id: string | null;
  latest_message_text: string | null;
  latest_intent: string | null;
  deal_record_id: string | null;
  card_version: number;
  updated_at: number;
}

export interface CustomerSnapshot {
  customer_id: string;
  line_user_id: string;
  display_name: string;
  picture_url?: string;
  stage: string;
  vip_status?: string;
  assigned_sales_id?: string;
  assigned_sales_name?: string;
  ai: AIAnalysisResult;
  last_message_at: number;
}

export interface QuoteItem {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface QuoteDraft {
  quotation_no: string;
  items: QuoteItem[];
  discount: number;
  vat_rate: number;
  vat_amount: number;
  shipping_fee: number;
  subtotal: number;
  total_amount: number;
  note?: string;
  valid_until?: string;
}

export interface DealSnapshot {
  deal_id: string;
  case_id: string;
  customer_id: string;
  sales_id?: string;
  sales_name?: string;
  quotation_no?: string;
  quotation_status?: string;
  quotation_items_json?: string;
  subtotal?: number;
  discount?: number;
  vat_rate?: number;
  vat_amount?: number;
  shipping_fee?: number;
  total_amount?: number;
  quotation_note?: string;
  quotation_valid_until?: string;
  quotation_sent_at?: number;
  payment_amount?: number;
  payment_status?: string;
  qr_sent_at?: number;
  deal_status?: string;
  closed_at?: number;
  created_at: number;
  updated_at: number;
}

export interface SalesPerformance {
  closed_won_amount: number;
  closed_won_count: number;
}

export interface CampaignDraft {
  segment: "vip" | "retarget";
  title: string;
  detail: string;
  coupon_code?: string;
  cta_label?: string;
  cta_url?: string;
  valid_until?: string;
}
