import type { Env } from "../config/env";
import { jsonResponse } from "../utils/response";

export function handleHealth(env: Env): Response {
  const vipConfigured = Boolean(env.VIP_GOLD_MIN_THB?.trim() || env.VIP_DIAMOND_MIN_THB?.trim());
  return jsonResponse({
    ok: true,
    service: "line-lark-sales-crm",
    version: "0.3.0-srs",
    readiness: {
      line: Boolean(env.LINE_CHANNEL_SECRET && env.LINE_CHANNEL_ACCESS_TOKEN),
      lark: Boolean(env.LARK_APP_ID && env.LARK_APP_SECRET && env.LARK_SALES_INBOX_CHAT_ID),
      lark_base: Boolean(env.LARK_BASE_APP_TOKEN && env.LARK_BASE_CUSTOMERS_TABLE_ID && env.LARK_BASE_CHAT_TRACKING_TABLE_ID && env.LARK_BASE_SALES_DEALS_TABLE_ID),
      promptpay: Boolean(env.PROMPTPAY_TARGET && env.PUBLIC_BASE_URL),
      media: Boolean(env.MEDIA_BUCKET && env.PUBLIC_BASE_URL),
      workers_ai: Boolean(env.AI),
      vip_thresholds_configured: vipConfigured,
    },
    timestamp: new Date().toISOString(),
  });
}
