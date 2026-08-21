import type { Env } from "../config/env";
import type { CampaignDraft, CaseRoute } from "../core/models";
import { asNumber, asString, isRecord, type UnknownRecord } from "../utils/json";

export type DraftKind = "quote" | "payment" | "close_deal" | "campaign";

export interface InteractionDraft<T = unknown> {
  draft_id: string;
  kind: DraftKind;
  case_id: string;
  created_by: string;
  payload: T;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  recipient_count: number | null;
  created_at: number;
  expires_at: number;
  completed_at: number | null;
}

export interface QrAsset {
  token: string;
  case_id: string;
  deal_record_id: string | null;
  amount_satang: number;
  promptpay_payload: string;
  created_at: number;
  expires_at: number;
}

function nullableString(value: unknown): string | null {
  const text = asString(value);
  return text || null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rowToRoute(row: UnknownRecord | null): CaseRoute | null {
  if (!row) return null;
  return {
    case_id: asString(row.case_id),
    line_user_id: asString(row.line_user_id),
    customer_id: asString(row.customer_id),
    customer_record_id: nullableString(row.customer_record_id),
    tracking_record_id: nullableString(row.tracking_record_id),
    root_message_id: nullableString(row.root_message_id),
    thread_id: nullableString(row.thread_id),
    owner_open_id: nullableString(row.owner_open_id),
    owner_name: nullableString(row.owner_name),
    status: asString(row.status, "NEW") as CaseRoute["status"],
    opened_at: asNumber(row.opened_at),
    claimed_at: nullableNumber(row.claimed_at),
    first_response_at: nullableNumber(row.first_response_at),
    closed_at: nullableNumber(row.closed_at),
    latest_line_message_id: nullableString(row.latest_line_message_id),
    latest_message_text: nullableString(row.latest_message_text),
    latest_intent: nullableString(row.latest_intent),
    deal_record_id: nullableString(row.deal_record_id),
    card_version: asNumber(row.card_version, 1),
    updated_at: asNumber(row.updated_at),
  };
}

function parseDraft<T>(row: UnknownRecord | null): InteractionDraft<T> | null {
  if (!row) return null;
  let payload: unknown = {};
  try { payload = JSON.parse(asString(row.payload_json, "{}")); } catch { payload = {}; }
  return {
    draft_id: asString(row.draft_id),
    kind: asString(row.kind) as DraftKind,
    case_id: asString(row.case_id),
    created_by: asString(row.created_by),
    payload: payload as T,
    status: asString(row.status, "PENDING") as InteractionDraft<T>["status"],
    recipient_count: nullableNumber(row.recipient_count),
    created_at: asNumber(row.created_at),
    expires_at: asNumber(row.expires_at),
    completed_at: nullableNumber(row.completed_at),
  };
}

export class OperationalRepository {
  constructor(private readonly env: Env) {}

  private async acquire(table: "event_dedupe" | "action_dedupe", keyColumn: "event_key" | "action_key", key: string, kind: string): Promise<boolean> {
    const now = Date.now();
    const inserted = await this.env.DB.prepare(
      `INSERT OR IGNORE INTO ${table} (${keyColumn}, kind, state, created_at, updated_at) VALUES (?, ?, 'PROCESSING', ?, ?)`
    ).bind(key, kind, now, now).run();
    if ((inserted.meta.changes ?? 0) > 0) return true;

    const staleBefore = now - 10 * 60_000;
    const reclaimed = await this.env.DB.prepare(
      `UPDATE ${table} SET state='PROCESSING', updated_at=?, error=NULL WHERE ${keyColumn}=? AND (state='FAILED' OR (state='PROCESSING' AND updated_at < ?))`
    ).bind(now, key, staleBefore).run();
    return (reclaimed.meta.changes ?? 0) > 0;
  }

  async acquireEvent(key: string, kind: string): Promise<boolean> {
    return await this.acquire("event_dedupe", "event_key", key, kind);
  }

  async completeEvent(key: string): Promise<void> {
    const now = Date.now();
    await this.env.DB.prepare("UPDATE event_dedupe SET state='COMPLETED', updated_at=?, completed_at=?, error=NULL WHERE event_key=?")
      .bind(now, now, key).run();
  }

  async failEvent(key: string, error: unknown): Promise<void> {
    await this.env.DB.prepare("UPDATE event_dedupe SET state='FAILED', updated_at=?, error=? WHERE event_key=?")
      .bind(Date.now(), error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000), key).run();
  }

  async acquireAction(key: string, kind: string): Promise<boolean> {
    return await this.acquire("action_dedupe", "action_key", key, kind);
  }

  async completeAction(key: string, result?: unknown): Promise<void> {
    const now = Date.now();
    await this.env.DB.prepare("UPDATE action_dedupe SET state='COMPLETED', result_json=?, updated_at=?, completed_at=?, error=NULL WHERE action_key=?")
      .bind(result === undefined ? null : JSON.stringify(result), now, now, key).run();
  }

  async failAction(key: string, error: unknown): Promise<void> {
    await this.env.DB.prepare("UPDATE action_dedupe SET state='FAILED', updated_at=?, error=? WHERE action_key=?")
      .bind(Date.now(), error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000), key).run();
  }

  async findActiveCaseByLineUserId(lineUserId: string): Promise<CaseRoute | null> {
    const row = await this.env.DB.prepare(
      "SELECT * FROM case_routes WHERE line_user_id=? AND status <> 'RESOLVED' ORDER BY opened_at DESC LIMIT 1"
    ).bind(lineUserId).first<UnknownRecord>();
    return rowToRoute(row);
  }

  async getCase(caseId: string): Promise<CaseRoute | null> {
    return rowToRoute(await this.env.DB.prepare("SELECT * FROM case_routes WHERE case_id=? LIMIT 1").bind(caseId).first<UnknownRecord>());
  }

  async getCaseByRootMessageId(rootMessageId: string): Promise<CaseRoute | null> {
    return rowToRoute(await this.env.DB.prepare("SELECT * FROM case_routes WHERE root_message_id=? LIMIT 1").bind(rootMessageId).first<UnknownRecord>());
  }

  async createCase(input: { case_id: string; line_user_id: string; customer_id: string; opened_at: number; latest_line_message_id: string; latest_message_text: string; latest_intent: string }): Promise<CaseRoute> {
    const now = Date.now();
    await this.env.DB.prepare(
      `INSERT INTO case_routes (case_id,line_user_id,customer_id,status,opened_at,latest_line_message_id,latest_message_text,latest_intent,card_version,updated_at)
       VALUES (?,?,?,'NEW',?,?,?,?,1,?)`
    ).bind(input.case_id, input.line_user_id, input.customer_id, input.opened_at, input.latest_line_message_id, input.latest_message_text, input.latest_intent, now).run();
    const route = await this.getCase(input.case_id);
    if (!route) throw new Error("Failed to create case route");
    return route;
  }

  async updateInbound(caseId: string, input: { latest_line_message_id: string; latest_message_text: string; latest_intent: string }): Promise<CaseRoute> {
    await this.env.DB.prepare(
      "UPDATE case_routes SET latest_line_message_id=?, latest_message_text=?, latest_intent=?, card_version=card_version+1, updated_at=? WHERE case_id=?"
    ).bind(input.latest_line_message_id, input.latest_message_text, input.latest_intent, Date.now(), caseId).run();
    const route = await this.getCase(caseId);
    if (!route) throw new Error("Case route missing after inbound update");
    return route;
  }

  async attachCustomerRecord(caseId: string, customerRecordId: string): Promise<void> {
    await this.env.DB.prepare("UPDATE case_routes SET customer_record_id=?, updated_at=? WHERE case_id=?").bind(customerRecordId, Date.now(), caseId).run();
  }

  async attachTrackingRecord(caseId: string, trackingRecordId: string): Promise<void> {
    await this.env.DB.prepare("UPDATE case_routes SET tracking_record_id=?, updated_at=? WHERE case_id=?").bind(trackingRecordId, Date.now(), caseId).run();
  }

  async setRootMessage(caseId: string, rootMessageId: string): Promise<CaseRoute> {
    await this.env.DB.prepare("UPDATE case_routes SET root_message_id=?, updated_at=? WHERE case_id=? AND root_message_id IS NULL")
      .bind(rootMessageId, Date.now(), caseId).run();
    const route = await this.getCase(caseId);
    if (!route) throw new Error("Case route missing after root message update");
    return route;
  }

  async claimCase(caseId: string, ownerOpenId: string, ownerName: string): Promise<{ won: boolean; route: CaseRoute }> {
    const now = Date.now();
    const result = await this.env.DB.prepare(
      "UPDATE case_routes SET owner_open_id=?, owner_name=?, status='CLAIMED', claimed_at=?, card_version=card_version+1, updated_at=? WHERE case_id=? AND owner_open_id IS NULL AND status='NEW'"
    ).bind(ownerOpenId, ownerName, now, now, caseId).run();
    const route = await this.getCase(caseId);
    if (!route) throw new Error("Case not found");
    return { won: (result.meta.changes ?? 0) > 0 && route.owner_open_id === ownerOpenId, route };
  }

  async setCaseStatus(caseId: string, status: CaseRoute["status"], closedAt?: number | null): Promise<CaseRoute> {
    const now = Date.now();
    if (closedAt !== undefined) {
      await this.env.DB.prepare("UPDATE case_routes SET status=?, closed_at=?, card_version=card_version+1, updated_at=? WHERE case_id=?")
        .bind(status, closedAt, now, caseId).run();
    } else {
      await this.env.DB.prepare("UPDATE case_routes SET status=?, card_version=card_version+1, updated_at=? WHERE case_id=?")
        .bind(status, now, caseId).run();
    }
    const route = await this.getCase(caseId);
    if (!route) throw new Error("Case not found after status update");
    return route;
  }

  async markFirstResponse(caseId: string, at: number): Promise<CaseRoute> {
    await this.env.DB.prepare(
      "UPDATE case_routes SET first_response_at=COALESCE(first_response_at, ?), status=CASE WHEN status='CLAIMED' THEN 'IN_PROGRESS' ELSE status END, card_version=card_version+1, updated_at=? WHERE case_id=?"
    ).bind(at, Date.now(), caseId).run();
    const route = await this.getCase(caseId);
    if (!route) throw new Error("Case not found after response update");
    return route;
  }

  async setDealRecord(caseId: string, dealRecordId: string): Promise<void> {
    await this.env.DB.prepare("UPDATE case_routes SET deal_record_id=?, updated_at=? WHERE case_id=?")
      .bind(dealRecordId, Date.now(), caseId).run();
  }

  async createDraft<T>(input: { draft_id: string; kind: DraftKind; case_id: string; created_by: string; payload: T; recipient_count?: number | null; ttlMs?: number }): Promise<void> {
    const now = Date.now();
    const ttl = Math.max(60_000, input.ttlMs ?? 30 * 60_000);
    await this.env.DB.prepare(
      "INSERT INTO interaction_drafts (draft_id,kind,case_id,created_by,payload_json,status,recipient_count,created_at,expires_at) VALUES (?,?,?,?,?,'PENDING',?,?,?)"
    ).bind(input.draft_id, input.kind, input.case_id, input.created_by, JSON.stringify(input.payload), input.recipient_count ?? null, now, now + ttl).run();
  }

  async getDraft<T>(draftId: string): Promise<InteractionDraft<T> | null> {
    const row = await this.env.DB.prepare("SELECT * FROM interaction_drafts WHERE draft_id=? LIMIT 1").bind(draftId).first<UnknownRecord>();
    const draft = parseDraft<T>(row);
    if (!draft || draft.expires_at < Date.now() || draft.status !== "PENDING") return null;
    return draft;
  }

  async finishDraft(draftId: string, status: "COMPLETED" | "CANCELLED" = "COMPLETED"): Promise<void> {
    await this.env.DB.prepare("UPDATE interaction_drafts SET status=?, completed_at=? WHERE draft_id=? AND status='PENDING'")
      .bind(status, Date.now(), draftId).run();
  }

  async createQrAsset(input: QrAsset): Promise<void> {
    await this.env.DB.prepare(
      "INSERT OR REPLACE INTO qr_assets (token,case_id,deal_record_id,amount_satang,promptpay_payload,created_at,expires_at) VALUES (?,?,?,?,?,?,?)"
    ).bind(input.token, input.case_id, input.deal_record_id, input.amount_satang, input.promptpay_payload, input.created_at, input.expires_at).run();
  }

  async getQrAsset(token: string): Promise<QrAsset | null> {
    const row = await this.env.DB.prepare("SELECT * FROM qr_assets WHERE token=? AND expires_at>? LIMIT 1").bind(token, Date.now()).first<UnknownRecord>();
    if (!row) return null;
    return {
      token: asString(row.token),
      case_id: asString(row.case_id),
      deal_record_id: nullableString(row.deal_record_id),
      amount_satang: asNumber(row.amount_satang),
      promptpay_payload: asString(row.promptpay_payload),
      created_at: asNumber(row.created_at),
      expires_at: asNumber(row.expires_at),
    };
  }

  async getCampaignBatch(draftId: string, batchIndex: number): Promise<{ state: string; retry_key: string } | null> {
    const row = await this.env.DB.prepare("SELECT state,retry_key FROM campaign_batches WHERE draft_id=? AND batch_index=? LIMIT 1")
      .bind(draftId, batchIndex).first<UnknownRecord>();
    return row ? { state: asString(row.state), retry_key: asString(row.retry_key) } : null;
  }

  async ensureCampaignBatch(draftId: string, batchIndex: number, retryKey: string, targetCount: number): Promise<void> {
    await this.env.DB.prepare(
      "INSERT OR IGNORE INTO campaign_batches (draft_id,batch_index,retry_key,state,target_count,updated_at) VALUES (?,?,?,'PENDING',?,?)"
    ).bind(draftId, batchIndex, retryKey, targetCount, Date.now()).run();
  }

  async markCampaignBatchSent(draftId: string, batchIndex: number): Promise<void> {
    await this.env.DB.prepare("UPDATE campaign_batches SET state='SENT', updated_at=? WHERE draft_id=? AND batch_index=?")
      .bind(Date.now(), draftId, batchIndex).run();
  }

  static campaignPayload(campaign: CampaignDraft, recipients: string[]): { campaign: CampaignDraft; recipients: string[] } {
    return { campaign, recipients };
  }
}
