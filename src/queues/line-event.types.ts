import type { QueueBatch, QueueMessage, QueueProducer } from "../platform/cloudflare";

export type LineSourceType = "user" | "group" | "room";
export type LineQueueMessageType = "text" | "image" | "sticker" | "audio" | "file" | "location";

export interface LineEventQueueMessage {
  schema_version: 1;
  channel: "LINE";
  webhook_event_id: string;
  destination: string;
  is_redelivery: boolean;
  occurred_at: number;
  source_type: LineSourceType;
  user_id: string;
  group_id?: string;
  room_id?: string;
  message: {
    id: string;
    type: LineQueueMessageType;
    text?: string;
    package_id?: string;
    sticker_id?: string;
    content_provider_type?: "line" | "external";
    original_content_url?: string;
    preview_image_url?: string;
    file_name?: string;
    file_size?: number;
    duration_ms?: number;
    title?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
  };
}

export interface CampaignDispatchQueueMessage {
  schema_version: 1;
  channel: "CRM";
  job_type: "campaign_dispatch";
  draft_id: string;
  case_id: string;
}

export type CrmQueueMessage = LineEventQueueMessage | CampaignDispatchQueueMessage;

export type QueueProducerBinding<T> = QueueProducer<T>;
export type QueueMessageLike<T> = QueueMessage<T>;
export type QueueBatchLike<T> = QueueBatch<T>;
