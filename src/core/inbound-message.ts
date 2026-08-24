import type { AIAnalysisResult } from "../ai/ai.types";

export type InboundMessageType = "text" | "image" | "sticker";

export interface LineInboundMessage {
  channel: "LINE";
  line_user_id: string;
  external_message_id: string;
  webhook_event_id: string;
  occurred_at: number;
  message_type: InboundMessageType;
  text: string;
  customer_name?: string;
  picture_url?: string;
  image_bytes?: ArrayBuffer;
  image_mime_type?: string;
}

export interface SalesCaseSignal {
  customer_key: string;
  message: LineInboundMessage;
  ai: AIAnalysisResult;
}
