#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resourceMapFromList, resolveCanonicalNamedResource } from "./lark-cli-resource-list.mjs";

function parseArgs(argv) {
  const out = { apply: false, baseToken: "", caseId: "", database: "line-lark-sales-crm" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") out.apply = true;
    else if (arg === "--base-token") out.baseToken = argv[++i] || "";
    else if (arg === "--case-id") out.caseId = argv[++i] || "";
    else if (arg === "--database") out.database = argv[++i] || "";
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/recover-failed-qr-case.mjs [--apply] --base-token <token> --case-id <case_id> [--database line-lark-sales-crm]\nDefault is read-only plan. Apply is fail-closed and only rolls back an Open PAYMENT/QR-Sent case to the last verified QUOTED state. Live emoji-prefixed table names are resolved to exact IDs first.");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!out.baseToken.trim()) throw new Error("--base-token is required");
  if (!out.caseId.trim()) throw new Error("--case-id is required");
  if (!/^case_[A-Za-z0-9-]+$/.test(out.caseId)) throw new Error("--case-id has unexpected format");
  if (!/^[A-Za-z0-9_-]+$/.test(out.database)) throw new Error("--database has unexpected format");
  return out;
}

function cliEnv() {
  return {
    ...process.env,
    LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
    LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1",
  };
}

function run(command, args, label, { requireOk = true } = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: cliEnv(),
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();
  if (result.status !== 0) throw new Error(`${label} failed (exit ${result.status}): ${(stderr || stdout).slice(0, 2200)}`);
  if (!stdout) return {};
  try {
    const parsed = JSON.parse(stdout);
    if (requireOk && parsed?.ok !== true) throw new Error(`${label} returned JSON without ok=true`);
    return parsed;
  } catch (error) {
    if (!requireOk) return { raw: stdout };
    throw error;
  }
}

function runLark(args, label) {
  return run("lark-cli", [...args, "--as", "user"], label);
}

function verifyAuth() {
  const status = run("lark-cli", ["auth", "status", "--json", "--verify"], "Lark auth", { requireOk: false });
  if (status?.identity !== "user" || status?.verified !== true) {
    throw new Error(`Lark user auth is not verified: identity=${String(status?.identity || "none")}`);
  }
}

function listTables(baseToken) {
  return resourceMapFromList(
    runLark(["base", "+table-list", "--base-token", baseToken], "List live Base tables"),
    { collectionKeys: ["tables", "items"], nameKeys: ["name", "table_name"], idKeys: ["id", "table_id"], label: "table" },
  );
}

function collectRecords(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectRecords(item, out);
  } else if (value && typeof value === "object") {
    if (typeof value.record_id === "string" && value.fields && typeof value.fields === "object" && !Array.isArray(value.fields)) {
      out.push({ record_id: value.record_id, fields: value.fields });
      return out;
    }
    for (const child of Object.values(value)) collectRecords(child, out);
  }
  return out;
}

function listByFilter(baseToken, table, filter) {
  const payload = runLark([
    "base", "+record-list",
    "--base-token", baseToken,
    "--table-id", table.id,
    "--filter-json", JSON.stringify(filter),
    "--limit", "50",
  ], `List ${table.displayName}`);
  const records = collectRecords(payload);
  const unique = new Map(records.map((record) => [record.record_id, record]));
  return [...unique.values()];
}

function exactOne(records, label) {
  if (records.length !== 1) throw new Error(`${label}: expected exactly 1 record, got ${records.length}`);
  return records[0];
}

function fieldText(record, name) {
  const value = record?.fields?.[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string") return value[0];
  return value == null ? "" : String(value);
}

function batchUpdate(baseToken, table, recordId, fields) {
  runLark([
    "base", "+record-batch-update",
    "--base-token", baseToken,
    "--table-id", table.id,
    "--json", JSON.stringify({ update_records: { [recordId]: fields } }),
  ], `Update ${table.displayName}.${recordId}`);
}

function readback(baseToken, table, recordId) {
  const payload = runLark([
    "base", "+record-get",
    "--base-token", baseToken,
    "--table-id", table.id,
    "--record-id", recordId,
  ], `Readback ${table.displayName}.${recordId}`);
  return exactOne(collectRecords(payload), `Readback ${table.displayName}.${recordId}`);
}

function wranglerD1(database, sql, label) {
  const result = spawnSync("npx", ["wrangler", "d1", "execute", database, "--remote", "--command", sql], {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed (exit ${result.status}): ${String(result.stderr || result.stdout || "").slice(0, 2200)}`);
  return String(result.stdout || "").trim();
}

const args = parseArgs(process.argv.slice(2));
verifyAuth();

const liveTables = listTables(args.baseToken);
const customersTable = resolveCanonicalNamedResource(liveTables, "Customers", "table");
const chatTable = resolveCanonicalNamedResource(liveTables, "Chat_Tracking", "table");
const dealsTable = resolveCanonicalNamedResource(liveTables, "Sales_Deals", "table");

const caseFilter = { logic: "and", conditions: [["case_id", "==", args.caseId]] };
const chatRows = listByFilter(args.baseToken, chatTable, caseFilter);
const caseRow = exactOne(chatRows.filter((record) => fieldText(record, "record_type") === "CASE"), "Chat_Tracking CASE");
const dealRow = exactOne(listByFilter(args.baseToken, dealsTable, caseFilter), "Sales_Deals");
const customerId = fieldText(caseRow, "customer_id") || fieldText(dealRow, "customer_id");
if (!customerId) throw new Error("Could not resolve customer_id from case/deal");
const customerRow = exactOne(listByFilter(args.baseToken, customersTable, { logic: "and", conditions: [["customer_id", "==", customerId]] }), "Customers");

const before = {
  customer_stage: fieldText(customerRow, "customer_stage"),
  customer_lead_quality: fieldText(customerRow, "lead_quality"),
  case_status: fieldText(caseRow, "case_status"),
  case_lead_quality: fieldText(caseRow, "lead_quality"),
  deal_status: fieldText(dealRow, "deal_status"),
  pipeline_stage: fieldText(dealRow, "pipeline_stage"),
  payment_status: fieldText(dealRow, "payment_status"),
  qr_sent_at_present: Boolean(dealRow.fields.qr_sent_at),
};

if (before.deal_status !== "Open") throw new Error(`Refusing recovery: deal_status=${before.deal_status}`);
if (before.case_status !== "PAYMENT") throw new Error(`Refusing recovery: case_status=${before.case_status}; expected PAYMENT`);
if (!["QR Sent", "Pending QR Send"].includes(before.payment_status)) {
  throw new Error(`Refusing recovery: payment_status=${before.payment_status}; expected QR Sent/Pending QR Send`);
}

const target = {
  customer_stage: "📄 Quotation Sent",
  customer_lead_quality: "⚡ High Intent",
  case_status: "QUOTED",
  case_lead_quality: "⚡ High Intent",
  pipeline_stage: "Quotation",
  payment_status: "Pending",
  qr_sent_at: null,
};

const resolvedTables = {
  Customers: { name: customersTable.displayName, id: customersTable.id },
  Chat_Tracking: { name: chatTable.displayName, id: chatTable.id },
  Sales_Deals: { name: dealsTable.displayName, id: dealsTable.id },
};

if (!args.apply) {
  console.log(JSON.stringify({
    ok: true,
    mode: "plan",
    mutation_count: 0,
    case_id: args.caseId,
    customer_id: customerId,
    live_table_resolution: "exact_id_from_table_list",
    resolved_tables: resolvedTables,
    before,
    target,
    records: {
      customer: customerRow.record_id,
      case_tracking: caseRow.record_id,
      deal: dealRow.record_id,
    },
  }, null, 2));
  process.exit(0);
}

batchUpdate(args.baseToken, customersTable, customerRow.record_id, {
  customer_stage: target.customer_stage,
  lead_quality: target.customer_lead_quality,
  lead_score: 60,
  hot_lead: false,
});
batchUpdate(args.baseToken, chatTable, caseRow.record_id, {
  case_status: target.case_status,
  lead_quality: target.case_lead_quality,
});
batchUpdate(args.baseToken, dealsTable, dealRow.record_id, {
  pipeline_stage: target.pipeline_stage,
  payment_status: target.payment_status,
  qr_sent_at: null,
});

const escapedCaseId = args.caseId.replaceAll("'", "''");
wranglerD1(
  args.database,
  `UPDATE case_routes SET status='QUOTED', card_version=card_version+1, updated_at=${Date.now()} WHERE case_id='${escapedCaseId}' AND status='PAYMENT'; SELECT case_id,status,deal_record_id FROM case_routes WHERE case_id='${escapedCaseId}';`,
  "Reset D1 case route",
);

const customerAfter = readback(args.baseToken, customersTable, customerRow.record_id);
const caseAfter = readback(args.baseToken, chatTable, caseRow.record_id);
const dealAfter = readback(args.baseToken, dealsTable, dealRow.record_id);
const actual = {
  customer_stage: fieldText(customerAfter, "customer_stage"),
  customer_lead_quality: fieldText(customerAfter, "lead_quality"),
  case_status: fieldText(caseAfter, "case_status"),
  case_lead_quality: fieldText(caseAfter, "lead_quality"),
  pipeline_stage: fieldText(dealAfter, "pipeline_stage"),
  payment_status: fieldText(dealAfter, "payment_status"),
  qr_sent_at_present: Boolean(dealAfter.fields.qr_sent_at),
};

if (
  actual.customer_stage !== target.customer_stage ||
  actual.customer_lead_quality !== target.customer_lead_quality ||
  actual.case_status !== target.case_status ||
  actual.case_lead_quality !== target.case_lead_quality ||
  actual.pipeline_stage !== target.pipeline_stage ||
  actual.payment_status !== target.payment_status ||
  actual.qr_sent_at_present
) {
  throw new Error(`Recovery readback mismatch: ${JSON.stringify(actual)}`);
}

console.log(JSON.stringify({
  ok: true,
  mode: "apply",
  mutation_count: 4,
  case_id: args.caseId,
  live_table_resolution: "exact_id_from_table_list",
  resolved_tables: resolvedTables,
  before,
  after: actual,
  status: "FAILED_QR_TEST_ROLLED_BACK_TO_LAST_VERIFIED_QUOTED_STATE",
}, null, 2));
