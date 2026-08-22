import type { D1Database, QueueProducer, R2Bucket, WorkersAI } from "../platform/cloudflare";
import type { LineEventQueueMessage } from "../queues/line-event.types";

export interface Env {
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_EVENTS_QUEUE: QueueProducer<LineEventQueueMessage>;

  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
  AI?: WorkersAI;
  AI_TEXT_MODEL?: string;
  AI_VISION_MODEL?: string;

  LARK_APP_ID: string;
  LARK_APP_SECRET: string;
  LARK_VERIFICATION_TOKEN: string;
  LARK_ENCRYPT_KEY?: string;
  LARK_SALES_INBOX_CHAT_ID: string;

  LARK_BASE_APP_TOKEN: string;
  LARK_BASE_CUSTOMERS_TABLE_ID: string;
  LARK_BASE_CHAT_TRACKING_TABLE_ID: string;
  LARK_BASE_SALES_DEALS_TABLE_ID: string;

  PROMPTPAY_TARGET: string;
  PROMPTPAY_TARGET_TYPE?: "phone" | "national_id" | "ewallet";
  PUBLIC_BASE_URL: string;
  COMPANY_NAME?: string;
  QUOTE_DEFAULT_VAT_RATE?: string;
  QR_TTL_SECONDS?: string;
  MEDIA_TTL_SECONDS?: string;
  VIP_GOLD_MIN_THB?: string;
  VIP_DIAMOND_MIN_THB?: string;
}

export function requireEnv(env: Env, key: keyof Env): string {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }
  return value.trim();
}
