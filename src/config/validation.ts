import type { Env } from "./env";

export type ConfigIssueSeverity = "error" | "warning";

export interface ConfigIssue {
  severity: ConfigIssueSeverity;
  code: string;
  key: string;
  message: string;
}

export interface DeploymentReadiness {
  ready: boolean;
  errors: ConfigIssue[];
  warnings: ConfigIssue[];
  checks: {
    line: boolean;
    lark: boolean;
    lark_base: boolean;
    promptpay: boolean;
    operational_state: boolean;
    media: boolean;
    workers_ai: boolean;
    gemini_image_ai: boolean;
    vip_thresholds_configured: boolean;
  };
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function numberValue(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function requiredString(issues: ConfigIssue[], env: Env, key: keyof Env): void {
  if (!hasText(env[key])) {
    issues.push({
      severity: "error",
      code: "MISSING_REQUIRED_CONFIG",
      key: String(key),
      message: `${String(key)} is required`,
    });
  }
}

function validatePositiveNumber(issues: ConfigIssue[], key: string, raw: string | undefined): void {
  const parsed = numberValue(raw);
  if (parsed === null) return;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    issues.push({
      severity: "error",
      code: "INVALID_POSITIVE_NUMBER",
      key,
      message: `${key} must be a positive number when configured`,
    });
  }
}

function looksLikePlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.endsWith("_xxx")
    || normalized.includes("replace_")
    || normalized.includes("replace-")
    || normalized.includes("your-worker.example")
    || normalized === "example";
}

function validatePromptPayTarget(issues: ConfigIssue[], target: string, type: string): void {
  if (!target.trim()) return;
  const digits = target.replace(/\D/g, "");
  let valid = false;
  if (type === "phone") valid = (digits.length === 10 && digits.startsWith("0")) || (digits.length === 11 && digits.startsWith("66"));
  else if (type === "national_id") valid = digits.length === 13;
  else if (type === "ewallet") valid = digits.length > 0;
  if (!valid) {
    issues.push({
      severity: "error",
      code: "INVALID_PROMPTPAY_TARGET",
      key: "PROMPTPAY_TARGET",
      message: `PROMPTPAY_TARGET does not match PROMPTPAY_TARGET_TYPE=${type}`,
    });
  }
}

export function validateDeploymentConfig(env: Env): DeploymentReadiness {
  const issues: ConfigIssue[] = [];

  const requiredKeys: Array<keyof Env> = [
    "LINE_CHANNEL_SECRET",
    "LINE_CHANNEL_ACCESS_TOKEN",
    "LARK_APP_ID",
    "LARK_APP_SECRET",
    "LARK_VERIFICATION_TOKEN",
    "LARK_SALES_INBOX_CHAT_ID",
    "LARK_BASE_APP_TOKEN",
    "LARK_BASE_CUSTOMERS_TABLE_ID",
    "LARK_BASE_CHAT_TRACKING_TABLE_ID",
    "LARK_BASE_SALES_DEALS_TABLE_ID",
    "PROMPTPAY_TARGET",
    "PUBLIC_BASE_URL",
  ];
  for (const key of requiredKeys) requiredString(issues, env, key);

  const placeholderKeys: Array<keyof Env> = [
    "LARK_APP_ID",
    "LARK_SALES_INBOX_CHAT_ID",
    "LARK_BASE_APP_TOKEN",
    "LARK_BASE_CUSTOMERS_TABLE_ID",
    "LARK_BASE_CHAT_TRACKING_TABLE_ID",
    "LARK_BASE_SALES_DEALS_TABLE_ID",
    "PUBLIC_BASE_URL",
  ];
  for (const key of placeholderKeys) {
    const value = env[key];
    if (typeof value === "string" && value.trim() && looksLikePlaceholder(value)) {
      issues.push({
        severity: "error",
        code: "PLACEHOLDER_CONFIG_VALUE",
        key: String(key),
        message: `${String(key)} still contains an example/placeholder value`,
      });
    }
  }

  if (!env.DB) {
    issues.push({ severity: "error", code: "MISSING_BINDING", key: "DB", message: "D1 binding DB is required" });
  }
  if (!env.LINE_EVENTS_QUEUE) {
    issues.push({ severity: "error", code: "MISSING_BINDING", key: "LINE_EVENTS_QUEUE", message: "Queue producer binding LINE_EVENTS_QUEUE is required" });
  }

  if (hasText(env.PUBLIC_BASE_URL)) {
    try {
      const url = new URL(env.PUBLIC_BASE_URL.trim());
      if (url.protocol !== "https:") throw new Error("not https");
      if (url.pathname !== "/" || url.search || url.hash) {
        issues.push({
          severity: "warning",
          code: "PUBLIC_BASE_URL_SHOULD_BE_ORIGIN",
          key: "PUBLIC_BASE_URL",
          message: "PUBLIC_BASE_URL should normally be the HTTPS origin without a path/query/hash",
        });
      }
    } catch {
      issues.push({
        severity: "error",
        code: "INVALID_PUBLIC_BASE_URL",
        key: "PUBLIC_BASE_URL",
        message: "PUBLIC_BASE_URL must be a valid HTTPS URL",
      });
    }
  }

  const promptPayType = env.PROMPTPAY_TARGET_TYPE ?? "phone";
  if (!["phone", "national_id", "ewallet"].includes(promptPayType)) {
    issues.push({
      severity: "error",
      code: "INVALID_PROMPTPAY_TARGET_TYPE",
      key: "PROMPTPAY_TARGET_TYPE",
      message: "PROMPTPAY_TARGET_TYPE must be phone, national_id, or ewallet",
    });
  } else {
    validatePromptPayTarget(issues, env.PROMPTPAY_TARGET ?? "", promptPayType);
  }

  const vat = numberValue(env.QUOTE_DEFAULT_VAT_RATE);
  if (vat !== null && (!Number.isFinite(vat) || vat < 0 || vat > 100)) {
    issues.push({
      severity: "error",
      code: "INVALID_VAT_RATE",
      key: "QUOTE_DEFAULT_VAT_RATE",
      message: "QUOTE_DEFAULT_VAT_RATE must be between 0 and 100",
    });
  }

  validatePositiveNumber(issues, "QR_TTL_SECONDS", env.QR_TTL_SECONDS);
  validatePositiveNumber(issues, "MEDIA_TTL_SECONDS", env.MEDIA_TTL_SECONDS);

  const gold = numberValue(env.VIP_GOLD_MIN_THB);
  const diamond = numberValue(env.VIP_DIAMOND_MIN_THB);
  for (const [key, value] of [["VIP_GOLD_MIN_THB", gold], ["VIP_DIAMOND_MIN_THB", diamond]] as const) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      issues.push({
        severity: "error",
        code: "INVALID_VIP_THRESHOLD",
        key,
        message: `${key} must be zero or greater when configured`,
      });
    }
  }
  if (gold !== null && diamond !== null && Number.isFinite(gold) && Number.isFinite(diamond) && diamond < gold) {
    issues.push({
      severity: "error",
      code: "INVALID_VIP_THRESHOLD_ORDER",
      key: "VIP_DIAMOND_MIN_THB",
      message: "VIP_DIAMOND_MIN_THB must be greater than or equal to VIP_GOLD_MIN_THB",
    });
  }

  if (!env.AI) {
    issues.push({
      severity: "warning",
      code: "WORKERS_AI_NOT_BOUND",
      key: "AI",
      message: "Workers AI is not bound; deterministic text rules will be used for text analysis",
    });
  }

  if (!hasText(env.GEMINI_API_KEY)) {
    issues.push({
      severity: "warning",
      code: "GEMINI_IMAGE_AI_NOT_CONFIGURED",
      key: "GEMINI_API_KEY",
      message: "Gemini image AI is not configured; images will still reach Lark but OCR/slip extraction will use safe fallback",
    });
  }

  if (!hasText(env.VIP_GOLD_MIN_THB) && !hasText(env.VIP_DIAMOND_MIN_THB)) {
    issues.push({
      severity: "warning",
      code: "VIP_THRESHOLDS_NOT_CONFIGURED",
      key: "VIP_GOLD_MIN_THB",
      message: "VIP thresholds are unset; existing VIP status will be preserved instead of auto-upgraded",
    });
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return {
    ready: errors.length === 0,
    errors,
    warnings,
    checks: {
      line: hasText(env.LINE_CHANNEL_SECRET) && hasText(env.LINE_CHANNEL_ACCESS_TOKEN),
      lark: hasText(env.LARK_APP_ID) && hasText(env.LARK_APP_SECRET) && hasText(env.LARK_VERIFICATION_TOKEN) && hasText(env.LARK_SALES_INBOX_CHAT_ID),
      lark_base: hasText(env.LARK_BASE_APP_TOKEN) && hasText(env.LARK_BASE_CUSTOMERS_TABLE_ID) && hasText(env.LARK_BASE_CHAT_TRACKING_TABLE_ID) && hasText(env.LARK_BASE_SALES_DEALS_TABLE_ID),
      promptpay: hasText(env.PROMPTPAY_TARGET) && hasText(env.PUBLIC_BASE_URL),
      operational_state: Boolean(env.DB && env.LINE_EVENTS_QUEUE),
      media: Boolean(env.DB && hasText(env.LARK_APP_ID) && hasText(env.LARK_APP_SECRET) && hasText(env.PUBLIC_BASE_URL)),
      workers_ai: Boolean(env.AI),
      gemini_image_ai: hasText(env.GEMINI_API_KEY),
      vip_thresholds_configured: hasText(env.VIP_GOLD_MIN_THB) || hasText(env.VIP_DIAMOND_MIN_THB),
    },
  };
}
