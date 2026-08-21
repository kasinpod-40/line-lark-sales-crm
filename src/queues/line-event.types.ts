import type { QueueBatch, QueueMessage, QueueProducer } from "../platform/cloudflare";

export type LineSourceType = "user" | "group" | "room";
export type LineQueueMessageType = "text" | "image" | "sticker";

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
  };
}

export type QueueProducerBinding<T> = QueueProducer<T>;
export type QueueMessageLike<T> = QueueMessage<T>;
export type QueueBatchLike<T> = QueueBatch<T>;
