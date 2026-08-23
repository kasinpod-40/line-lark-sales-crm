import type { Env } from "../config/env";
import type { CaseRoute } from "../core/models";
import { OperationalRepository } from "../storage/operational.repository";
import { asBoolean, asNumber, asString, isRecord, type UnknownRecord } from "../utils/json";

const CUSTOMER_STAGE = {
  NEW: "🌱 New Lead",
  CONTACTED: "💬 Contacted",
  QUOTATION: "📄 Quotation Sent",
  PAYMENT: "💳 Payment Pending",
  ACTIVE: "🏆 Active Customer",
  INACTIVE: "💤 Inactive",
} as const;

const LEAD_QUALITY = {
  NEW: "🌱 New Lead",
  HIGH: "⚡ High Intent",
  HOT: "🔥 Hot Lead",
} as const;

const stageRank = new Map<string, number>([
  [CUSTOMER_STAGE.NEW, 0],
  [CUSTOMER_STAGE.INACTIVE, 0],
  [CUSTOMER_STAGE.CONTACTED, 1],
  [CUSTOMER_STAGE.QUOTATION, 2],
  [CUSTOMER_STAGE.PAYMENT, 3],
  [CUSTOMER_STAGE.ACTIVE, 4],
]);

const qualityRank = new Map<string, number>([
  [LEAD_QUALITY.NEW, 0],
  [LEAD_QUALITY.HIGH, 1],
  [LEAD_QUALITY.HOT, 2],
]);

const pipelineRank = new Map<string, number>([
  ["Lead", 0],
  ["Quotation", 1],
  ["Payment Pending", 2],
  ["Payment Received", 3],
  ["Closed Won", 4],
]);

let cachedToken: { value: string; expiresAt: number } | null = null;

async function tenantToken(env: Env): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - now > 60_000) return cachedToken.value;
  const response = await fetch("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app_id: env.LARK_APP_ID, app_secret: env.LARK_APP_SECRET }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Lark tenant token failed: ${response.status} ${text.slice(0, 500)}`);
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error("Invalid Lark tenant token response");
  const value = asString(parsed.tenant_access_token);
  if (!value) throw new Error("Lark tenant token missing");
  cachedToken = { value, expiresAt: now + asNumber(parsed.expire, 7200) * 1000 };
  return value;
}

async function baseFetch(env: Env, path: string, init: RequestInit = {}): Promise<UnknownRecord> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await tenantToken(env)}`);
  if (init.body) headers.set("content-type", "application/json");
  const response = await fetch(`https://open.larksuite.com${path}`, { ...init, headers });
  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : {};
  if (!response.ok || !isRecord(parsed)) throw new Error(`Lark Base ${path} failed: ${response.status} ${text.slice(0, 700)}`);
  if (typeof parsed.code === "number" && parsed.code !== 0) throw new Error(`Lark Base ${path} error ${parsed.code}: ${asString(parsed.msg)}`);
  return parsed;
}

function recordPath(env: Env, tableId: string, recordId: string): string {
  return `/open-apis/bitable/v1/apps/${encodeURIComponent(env.LARK_BASE_APP_TOKEN)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`;
}

async function readRecord(env: Env, tableId: string, recordId: string): Promise<UnknownRecord> {
  const response = await baseFetch(env, recordPath(env, tableId, recordId));
  const data = isRecord(response.data) ? response.data : {};
  const record = isRecord(data.record) ? data.record : {};
  return isRecord(record.fields) ? record.fields : {};
}

async function updateRecord(env: Env, tableId: string, recordId: string, fields: UnknownRecord): Promise<void> {
  if (Object.keys(fields).length === 0) return;
  await baseFetch(env, recordPath(env, tableId, recordId), {
    method: "PUT",
    body: JSON.stringify({ fields }),
  });
}

function higherValue(current: string, target: string, ranks: Map<string, number>): string {
  const currentRank = ranks.get(current) ?? -1;
  const targetRank = ranks.get(target) ?? -1;
  return currentRank >= targetRank ? current : target;
}

function targetForStatus(status: CaseRoute["status"]): {
  customerStage?: string;
  qualityFloor?: string;
  scoreFloor?: number;
  hot?: boolean;
  pipelineStage?: string;
} {
  switch (status) {
    case "CLAIMED":
    case "IN_PROGRESS":
      return { customerStage: CUSTOMER_STAGE.CONTACTED };
    case "QUOTED":
      return {
        customerStage: CUSTOMER_STAGE.QUOTATION,
        qualityFloor: LEAD_QUALITY.HIGH,
        scoreFloor: 60,
        pipelineStage: "Quotation",
      };
    case "PAYMENT":
      return {
        customerStage: CUSTOMER_STAGE.PAYMENT,
        qualityFloor: LEAD_QUALITY.HOT,
        scoreFloor: 80,
        hot: true,
        pipelineStage: "Payment Pending",
      };
    case "WON":
      return {
        customerStage: CUSTOMER_STAGE.ACTIVE,
        qualityFloor: LEAD_QUALITY.HOT,
        scoreFloor: 80,
        hot: true,
        pipelineStage: "Closed Won",
      };
    default:
      return {};
  }
}

export class CommercialLifecycleService {
  private readonly operational: OperationalRepository;

  constructor(private readonly env: Env) {
    this.operational = new OperationalRepository(env);
  }

  async reconcileByLineUserId(lineUserId: string): Promise<void> {
    const route = await this.operational.findActiveCaseByLineUserId(lineUserId);
    if (route) await this.reconcileCase(route.case_id);
  }

  async reconcileCase(caseId: string): Promise<void> {
    const route = await this.operational.getCase(caseId);
    if (!route) return;
    const target = targetForStatus(route.status);
    let effectiveQuality = "";

    if (route.customer_record_id) {
      const current = await readRecord(this.env, this.env.LARK_BASE_CUSTOMERS_TABLE_ID, route.customer_record_id);
      const currentStage = asString(current.customer_stage, CUSTOMER_STAGE.NEW);
      const currentQuality = asString(current.lead_quality, LEAD_QUALITY.NEW);
      const currentScore = asNumber(current.lead_score, 0);
      const currentHot = asBoolean(current.hot_lead, false);
      const patch: UnknownRecord = {};

      if (target.customerStage) {
        const nextStage = higherValue(currentStage, target.customerStage, stageRank);
        if (nextStage !== currentStage) patch.customer_stage = nextStage;
      }

      effectiveQuality = currentQuality;
      if (target.qualityFloor) {
        effectiveQuality = higherValue(currentQuality, target.qualityFloor, qualityRank);
        if (effectiveQuality !== currentQuality) patch.lead_quality = effectiveQuality;
      }

      if (typeof target.scoreFloor === "number" && currentScore < target.scoreFloor) {
        patch.lead_score = target.scoreFloor;
      }
      if (target.hot === true && !currentHot) patch.hot_lead = true;
      if (Object.keys(patch).length > 0) patch.updated_at = Date.now();
      await updateRecord(this.env, this.env.LARK_BASE_CUSTOMERS_TABLE_ID, route.customer_record_id, patch);
    }

    if (route.tracking_record_id) {
      const current = await readRecord(this.env, this.env.LARK_BASE_CHAT_TRACKING_TABLE_ID, route.tracking_record_id);
      const currentQuality = asString(current.lead_quality);
      const desiredQuality = target.qualityFloor
        ? higherValue(currentQuality || LEAD_QUALITY.NEW, target.qualityFloor, qualityRank)
        : effectiveQuality;
      if (desiredQuality && desiredQuality !== currentQuality) {
        await updateRecord(this.env, this.env.LARK_BASE_CHAT_TRACKING_TABLE_ID, route.tracking_record_id, {
          lead_quality: desiredQuality,
          updated_at: Date.now(),
        });
      }
    }

    if (route.deal_record_id && target.pipelineStage) {
      const current = await readRecord(this.env, this.env.LARK_BASE_SALES_DEALS_TABLE_ID, route.deal_record_id);
      const currentPipeline = asString(current.pipeline_stage, "Lead");
      const nextPipeline = higherValue(currentPipeline, target.pipelineStage, pipelineRank);
      if (nextPipeline !== currentPipeline) {
        await updateRecord(this.env, this.env.LARK_BASE_SALES_DEALS_TABLE_ID, route.deal_record_id, {
          pipeline_stage: nextPipeline,
          updated_at: Date.now(),
        });
      }
    }
  }
}
