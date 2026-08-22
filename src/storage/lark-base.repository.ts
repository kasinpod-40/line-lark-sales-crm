import type { Env } from "../config/env";
import { actionGuidance, intentLabel, leadQuality } from "../ai/presentation";
import type { CustomerSnapshot, DealSnapshot, CaseRoute, QuoteDraft, SalesPerformance } from "../core/models";
import { calculateSla } from "../core/sla";
import { isValidLineUserId } from "../providers/line/line.provider";
import { asBoolean, asNumber, asString, isRecord, type UnknownRecord } from "../utils/json";

interface BaseRecord {
  record_id: string;
  fields: UnknownRecord;
}

interface MessageTrackingInput {
  tracking_id: string;
  case_id: string;
  customer_id: string;
  sales_id?: string;
  sales_name?: string;
  direction: "customer_to_sales" | "sales_to_customer";
  message_type: string;
  message_id: string;
  message_text: string;
  event_at: number;
}

const CUSTOMER_STAGE = {
  NEW: "🌱 New Lead",
  CONTACTED: "💬 Contacted",
  QUOTATION: "📄 Quotation Sent",
  ACTIVE: "🏆 Active Customer",
  INACTIVE: "💤 Inactive",
} as const;

const VIP_STATUS = {
  STANDARD: "Standard",
  GOLD: "🥇 Gold VIP",
  DIAMOND: "💎 Diamond VIP",
} as const;

const CLOSED_WON_VALUES = new Set(["Closed Won", "Closed Won 🏆"]);

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
  if (!response.ok) throw new Error(`Lark tenant token failed: ${response.status} ${text.slice(0, 800)}`);
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
  if (!response.ok || !isRecord(parsed)) throw new Error(`Lark Base ${path} failed: ${response.status} ${text.slice(0, 1000)}`);
  if (typeof parsed.code === "number" && parsed.code !== 0) throw new Error(`Lark Base ${path} error ${parsed.code}: ${asString(parsed.msg)}`);
  return parsed;
}

function dataOf(response: UnknownRecord): UnknownRecord {
  return isRecord(response.data) ? response.data : {};
}

function normalizeRecord(value: unknown): BaseRecord | null {
  if (!isRecord(value)) return null;
  const recordId = asString(value.record_id);
  const fields = isRecord(value.fields) ? value.fields : {};
  return recordId ? { record_id: recordId, fields } : null;
}

function incomingCustomerStage(stage: string): string {
  if (stage === "Won" || stage === "Active Customer" || stage === CUSTOMER_STAGE.ACTIVE) return CUSTOMER_STAGE.ACTIVE;
  if (stage === "Lost" || stage === "Inactive" || stage === CUSTOMER_STAGE.INACTIVE) return CUSTOMER_STAGE.INACTIVE;
  if (stage === "Contacted" || stage === CUSTOMER_STAGE.CONTACTED) return CUSTOMER_STAGE.CONTACTED;
  if (stage === "Quotation Sent" || stage === CUSTOMER_STAGE.QUOTATION) return CUSTOMER_STAGE.QUOTATION;
  return CUSTOMER_STAGE.NEW;
}

function preservedCustomerStage(existing: string, incoming: string): string {
  if (existing === CUSTOMER_STAGE.ACTIVE) return existing;
  if (existing === CUSTOMER_STAGE.QUOTATION) return incoming === CUSTOMER_STAGE.ACTIVE ? incoming : existing;
  if (existing === CUSTOMER_STAGE.CONTACTED) {
    if (incoming === CUSTOMER_STAGE.ACTIVE || incoming === CUSTOMER_STAGE.QUOTATION) return incoming;
    return existing;
  }
  if (existing === CUSTOMER_STAGE.INACTIVE && incoming === CUSTOMER_STAGE.NEW) return CUSTOMER_STAGE.NEW;
  return incoming;
}

export function vipStatusForSpend(
  totalSpendThb: number,
  currentVipStatus: string,
  goldMinRaw?: string,
  diamondMinRaw?: string,
): string {
  const goldMin = asNumber(goldMinRaw, 0);
  const diamondMin = asNumber(diamondMinRaw, 0);
  const hasGold = goldMin > 0;
  const hasDiamond = diamondMin > 0;
  if (!hasGold && !hasDiamond) return currentVipStatus || VIP_STATUS.STANDARD;
  if (hasDiamond && totalSpendThb >= diamondMin) return VIP_STATUS.DIAMOND;
  if (hasGold && totalSpendThb >= goldMin) return VIP_STATUS.GOLD;
  return VIP_STATUS.STANDARD;
}

function isClosedWon(value: unknown): boolean {
  return CLOSED_WON_VALUES.has(asString(value));
}

function dealFromRecord(record: BaseRecord): DealSnapshot {
  const f = record.fields;
  return {
    deal_id: asString(f.deal_id),
    case_id: asString(f.case_id),
    customer_id: asString(f.customer_id),
    sales_id: asString(f.sales_id) || undefined,
    sales_name: asString(f.sales_rep) || undefined,
    quotation_no: asString(f.quotation_no) || undefined,
    quotation_status: asString(f.quotation_status) || undefined,
    quotation_items_json: asString(f.quotation_items_json) || undefined,
    subtotal: typeof f.subtotal === "number" ? f.subtotal : undefined,
    discount: typeof f.discount === "number" ? f.discount : undefined,
    vat_rate: typeof f.vat_rate === "number" ? f.vat_rate : undefined,
    vat_amount: typeof f.vat_amount === "number" ? f.vat_amount : undefined,
    shipping_fee: typeof f.shipping_fee === "number" ? f.shipping_fee : undefined,
    total_amount: typeof f.total_amount === "number" ? f.total_amount : typeof f.deal_value_thb === "number" ? f.deal_value_thb : undefined,
    quotation_note: asString(f.quotation_note) || undefined,
    quotation_valid_until: asString(f.quotation_valid_until) || undefined,
    quotation_sent_at: typeof f.quotation_sent_at === "number" ? f.quotation_sent_at : undefined,
    payment_amount: typeof f.payment_amount === "number" ? f.payment_amount : undefined,
    payment_status: asString(f.payment_status) || undefined,
    qr_sent_at: typeof f.qr_sent_at === "number" ? f.qr_sent_at : undefined,
    deal_status: asString(f.deal_status) || undefined,
    closed_at: typeof f.closed_at === "number" ? f.closed_at : undefined,
    created_at: asNumber(f.created_at),
    updated_at: asNumber(f.updated_at),
  };
}

export class LarkBaseRepository {
  constructor(private readonly env: Env) {}

  private tablePath(tableId: string): string {
    return `/open-apis/bitable/v1/apps/${encodeURIComponent(this.env.LARK_BASE_APP_TOKEN)}/tables/${encodeURIComponent(tableId)}/records`;
  }

  private async listAll(tableId: string): Promise<BaseRecord[]> {
    const records: BaseRecord[] = [];
    let pageToken = "";
    for (let page = 0; page < 100; page += 1) {
      const params = new URLSearchParams({ page_size: "500" });
      if (pageToken) params.set("page_token", pageToken);
      const response = await baseFetch(this.env, `${this.tablePath(tableId)}?${params.toString()}`);
      const data = dataOf(response);
      const items = Array.isArray(data.items) ? data.items : [];
      for (const item of items) {
        const record = normalizeRecord(item);
        if (record) records.push(record);
      }
      if (data.has_more !== true) break;
      pageToken = asString(data.page_token);
      if (!pageToken) break;
    }
    return records;
  }

  private async findByField(tableId: string, field: string, value: string): Promise<BaseRecord | null> {
    const records = await this.listAll(tableId);
    return records.find((record) => asString(record.fields[field]) === value) ?? null;
  }

  private async create(tableId: string, fields: UnknownRecord): Promise<BaseRecord> {
    const response = await baseFetch(this.env, this.tablePath(tableId), {
      method: "POST",
      body: JSON.stringify({ fields }),
    });
    const data = dataOf(response);
    const record = normalizeRecord(data.record);
    if (!record) throw new Error("Lark Base create record returned no record");
    return record;
  }

  private async update(tableId: string, recordId: string, fields: UnknownRecord): Promise<BaseRecord> {
    const response = await baseFetch(this.env, `${this.tablePath(tableId)}/${encodeURIComponent(recordId)}`, {
      method: "PUT",
      body: JSON.stringify({ fields }),
    });
    const data = dataOf(response);
    const record = normalizeRecord(data.record);
    return record ?? { record_id: recordId, fields };
  }

  async upsertCustomer(snapshot: CustomerSnapshot): Promise<{ recordId: string; created: boolean }> {
    const table = this.env.LARK_BASE_CUSTOMERS_TABLE_ID;
    const existing = await this.findByField(table, "customer_id", snapshot.customer_id);
    const now = Date.now();
    const incomingStage = incomingCustomerStage(snapshot.stage);
    const customerStage = existing
      ? preservedCustomerStage(asString(existing.fields.customer_stage, CUSTOMER_STAGE.NEW), incomingStage)
      : incomingStage;
    const fields: UnknownRecord = {
      customer_id: snapshot.customer_id,
      line_user_id: snapshot.line_user_id,
      display_name: snapshot.display_name,
      picture_url: snapshot.picture_url ?? "",
      customer_stage: customerStage,
      vip_status: snapshot.vip_status ?? (existing ? asString(existing.fields.vip_status, VIP_STATUS.STANDARD) : VIP_STATUS.STANDARD),
      assigned_sales_id: snapshot.assigned_sales_id ?? (existing ? asString(existing.fields.assigned_sales_id) : ""),
      assigned_sales_name: snapshot.assigned_sales_name ?? (existing ? asString(existing.fields.assigned_sales_name) : ""),
      ai_intent: snapshot.ai.intent,
      ai_intent_label: intentLabel(snapshot.ai.intent),
      buyer_intent: snapshot.ai.buyer_intent,
      lead_quality: leadQuality(snapshot.ai.lead_score),
      lead_score: snapshot.ai.lead_score,
      hot_lead: snapshot.ai.hot_lead,
      ai_summary: snapshot.ai.ai_summary,
      ai_guidance: actionGuidance(snapshot.ai),
      last_message_at: snapshot.last_message_at,
      created_at: existing ? asNumber(existing.fields.created_at, now) : now,
      updated_at: now,
    };
    const saved = existing ? await this.update(table, existing.record_id, fields) : await this.create(table, fields);
    return { recordId: saved.record_id, created: !existing };
  }

  async updateCustomerOwner(customerId: string, salesId: string, salesName: string): Promise<void> {
    const table = this.env.LARK_BASE_CUSTOMERS_TABLE_ID;
    const existing = await this.findByField(table, "customer_id", customerId);
    if (!existing) return;
    const currentStage = asString(existing.fields.customer_stage, CUSTOMER_STAGE.NEW);
    await this.update(table, existing.record_id, {
      assigned_sales_id: salesId,
      assigned_sales_name: salesName,
      customer_stage: [CUSTOMER_STAGE.ACTIVE, CUSTOMER_STAGE.QUOTATION].includes(currentStage as typeof CUSTOMER_STAGE.ACTIVE | typeof CUSTOMER_STAGE.QUOTATION)
        ? currentStage
        : CUSTOMER_STAGE.CONTACTED,
      updated_at: Date.now(),
    });
  }

  async markCustomerQuotationSent(customerId: string): Promise<void> {
    const table = this.env.LARK_BASE_CUSTOMERS_TABLE_ID;
    const existing = await this.findByField(table, "customer_id", customerId);
    if (!existing) return;
    const currentStage = asString(existing.fields.customer_stage, CUSTOMER_STAGE.NEW);
    await this.update(table, existing.record_id, {
      customer_stage: currentStage === CUSTOMER_STAGE.ACTIVE ? currentStage : CUSTOMER_STAGE.QUOTATION,
      updated_at: Date.now(),
    });
  }

  async markCustomerActive(customerId: string, totalSpendThb: number): Promise<void> {
    const table = this.env.LARK_BASE_CUSTOMERS_TABLE_ID;
    const existing = await this.findByField(table, "customer_id", customerId);
    if (!existing) return;
    const currentVip = asString(existing.fields.vip_status, VIP_STATUS.STANDARD);
    await this.update(table, existing.record_id, {
      customer_stage: CUSTOMER_STAGE.ACTIVE,
      vip_status: vipStatusForSpend(totalSpendThb, currentVip, this.env.VIP_GOLD_MIN_THB, this.env.VIP_DIAMOND_MIN_THB),
      updated_at: Date.now(),
    });
  }

  async upsertCaseTracking(route: CaseRoute): Promise<string> {
    const table = this.env.LARK_BASE_CHAT_TRACKING_TABLE_ID;
    const trackingId = `case:${route.case_id}`;
    const existing = await this.findByField(table, "tracking_id", trackingId);
    const sla = calculateSla(route);
    const fields: UnknownRecord = {
      tracking_id: trackingId,
      record_type: "CASE",
      case_id: route.case_id,
      customer_id: route.customer_id,
      ...(route.customer_record_id ? { customer: [route.customer_record_id] } : {}),
      customer_msg_time: route.opened_at,
      sales_reply_time: route.first_response_at ?? null,
      assigned_sales: route.owner_name ?? "",
      assigned_sales_id: route.owner_open_id ?? "",
      ai_intent: route.latest_intent ?? "",
      channel: "🟢 LINE Official Account",
      lark_root_message_id: route.root_message_id ?? "",
      lark_thread_id: route.thread_id ?? "",
      case_status: route.status,
      opened_at: route.opened_at,
      claimed_at: route.claimed_at ?? null,
      claim_seconds: route.claimed_at ? Math.max(0, Math.round((route.claimed_at - route.opened_at) / 1000)) : 0,
      first_response_at: route.first_response_at ?? null,
      first_response_seconds: sla.first_response_seconds ?? 0,
      closed_at: route.closed_at ?? null,
      resolution_seconds: sla.resolution_seconds ?? 0,
      updated_at: Date.now(),
    };
    const saved = existing ? await this.update(table, existing.record_id, fields) : await this.create(table, fields);
    return saved.record_id;
  }

  async createMessageTracking(input: MessageTrackingInput): Promise<void> {
    const table = this.env.LARK_BASE_CHAT_TRACKING_TABLE_ID;
    const existing = await this.findByField(table, "tracking_id", input.tracking_id);
    if (existing) return;
    const customer = await this.findByField(this.env.LARK_BASE_CUSTOMERS_TABLE_ID, "customer_id", input.customer_id);
    await this.create(table, {
      tracking_id: input.tracking_id,
      record_type: "MESSAGE",
      case_id: input.case_id,
      customer_id: input.customer_id,
      ...(customer ? { customer: [customer.record_id] } : {}),
      assigned_sales: input.sales_name ?? "",
      assigned_sales_id: input.sales_id ?? "",
      direction: input.direction,
      channel: "🟢 LINE Official Account",
      message_type: input.message_type,
      message_id: input.message_id,
      message_text: input.message_text,
      customer_msg_time: input.direction === "customer_to_sales" ? input.event_at : null,
      sales_reply_time: input.direction === "sales_to_customer" ? input.event_at : null,
      event_at: input.event_at,
      updated_at: Date.now(),
    });
  }

  async saveQuote(input: { dealId: string; route: CaseRoute; quote: QuoteDraft; quotationStatus: string }): Promise<string> {
    const table = this.env.LARK_BASE_SALES_DEALS_TABLE_ID;
    const existing = await this.findByField(table, "deal_id", input.dealId);
    const now = Date.now();
    const fields: UnknownRecord = {
      deal_id: input.dealId,
      case_id: input.route.case_id,
      customer_id: input.route.customer_id,
      ...(input.route.customer_record_id ? { customer: [input.route.customer_record_id] } : {}),
      deal_value_thb: input.quote.total_amount,
      sales_id: input.route.owner_open_id ?? "",
      sales_rep: input.route.owner_name ?? "",
      deal_status: existing ? asString(existing.fields.deal_status, "Open") : "Open",
      pipeline_stage: "Quotation",
      quotation_no: input.quote.quotation_no,
      quotation_status: input.quotationStatus,
      quotation_items_json: JSON.stringify(input.quote.items),
      subtotal: input.quote.subtotal,
      discount: input.quote.discount,
      vat_rate: input.quote.vat_rate,
      vat_amount: input.quote.vat_amount,
      shipping_fee: input.quote.shipping_fee,
      total_amount: input.quote.total_amount,
      quotation_note: input.quote.note ?? "",
      quotation_valid_until: input.quote.valid_until ?? "",
      quotation_sent_at: input.quotationStatus === "Sent" ? now : existing ? existing.fields.quotation_sent_at ?? null : null,
      payment_amount: existing ? asNumber(existing.fields.payment_amount, 0) : 0,
      payment_status: existing ? asString(existing.fields.payment_status, "Pending") : "Pending",
      closed_at: existing ? existing.fields.closed_at ?? null : null,
      created_at: existing ? asNumber(existing.fields.created_at, now) : now,
      updated_at: now,
    };
    const saved = existing ? await this.update(table, existing.record_id, fields) : await this.create(table, fields);
    return saved.record_id;
  }

  async markQuoteSent(recordId: string): Promise<void> {
    await this.update(this.env.LARK_BASE_SALES_DEALS_TABLE_ID, recordId, {
      quotation_status: "Sent",
      quotation_sent_at: Date.now(),
      pipeline_stage: "Quotation",
      updated_at: Date.now(),
    });
  }

  async getLatestDealForCase(caseId: string): Promise<{ recordId: string; deal: DealSnapshot } | null> {
    const all = await this.listAll(this.env.LARK_BASE_SALES_DEALS_TABLE_ID);
    const matching = all.filter((record) => asString(record.fields.case_id) === caseId)
      .sort((a, b) => asNumber(b.fields.updated_at) - asNumber(a.fields.updated_at));
    const record = matching[0];
    return record ? { recordId: record.record_id, deal: dealFromRecord(record) } : null;
  }

  async markQrState(recordId: string, amount: number, status: "Pending QR Send" | "QR Sent"): Promise<void> {
    const now = Date.now();
    await this.update(this.env.LARK_BASE_SALES_DEALS_TABLE_ID, recordId, {
      deal_value_thb: amount,
      payment_amount: amount,
      payment_status: status,
      qr_sent_at: status === "QR Sent" ? now : null,
      updated_at: now,
    });
  }

  async closeDeal(recordId: string, amount: number): Promise<void> {
    const now = Date.now();
    await this.update(this.env.LARK_BASE_SALES_DEALS_TABLE_ID, recordId, {
      deal_value_thb: amount,
      payment_amount: amount,
      payment_status: "Paid",
      deal_status: "Closed Won 🏆",
      pipeline_stage: "Closed Won",
      closed_at: now,
      updated_at: now,
    });
  }

  async getSalesPerformance(salesId: string): Promise<SalesPerformance> {
    const all = await this.listAll(this.env.LARK_BASE_SALES_DEALS_TABLE_ID);
    const won = all.filter((record) => asString(record.fields.sales_id) === salesId && isClosedWon(record.fields.deal_status));
    return {
      closed_won_amount: won.reduce((sum, record) => sum + asNumber(record.fields.deal_value_thb, asNumber(record.fields.payment_amount, asNumber(record.fields.total_amount, 0))), 0),
      closed_won_count: won.length,
    };
  }

  async getCustomerLifetimeValue(customerId: string): Promise<number> {
    const all = await this.listAll(this.env.LARK_BASE_SALES_DEALS_TABLE_ID);
    return all
      .filter((record) => asString(record.fields.customer_id) === customerId && isClosedWon(record.fields.deal_status))
      .reduce((sum, record) => sum + asNumber(record.fields.deal_value_thb, asNumber(record.fields.payment_amount, asNumber(record.fields.total_amount, 0))), 0);
  }

  async listSegmentLineUsers(segment: "vip" | "retarget"): Promise<string[]> {
    const all = await this.listAll(this.env.LARK_BASE_CUSTOMERS_TABLE_ID);
    const users = all.filter((record) => {
      const f = record.fields;
      const line = asString(f.line_user_id).trim();
      if (!isValidLineUserId(line)) return false;
      if (segment === "vip") {
        return [VIP_STATUS.GOLD, VIP_STATUS.DIAMOND].includes(asString(f.vip_status) as typeof VIP_STATUS.GOLD | typeof VIP_STATUS.DIAMOND);
      }
      const stage = asString(f.customer_stage);
      const buyer = asString(f.buyer_intent);
      const hot = asBoolean(f.hot_lead, false);
      return stage === CUSTOMER_STAGE.QUOTATION || hot || ["Purchase Intent", "Ready To Buy"].includes(buyer);
    }).map((record) => asString(record.fields.line_user_id).trim());
    return Array.from(new Set(users));
  }
}
