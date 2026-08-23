#!/usr/bin/env node

import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { resourceMapFromList, resolveCanonicalNamedResource } from "./lark-cli-resource-list.mjs";

function parseArgs(argv) {
  const out = { apply: false, baseToken: "", caseId: "", databaseId: "", database: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") out.apply = true;
    else if (arg === "--base-token") out.baseToken = argv[++i] || "";
    else if (arg === "--case-id") out.caseId = argv[++i] || "";
    else if (arg === "--database-id") out.databaseId = argv[++i] || "";
    else if (arg === "--database") out.database = argv[++i] || "";
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/recover-failed-qr-case.mjs [--apply] --base-token <token> --case-id <case_id> --database-id <d1_uuid> [--database <legacy_name>]\nDefault is read-only plan. Apply is fail-closed and rolls back only the named Open QR-test case to the last verified QUOTED state. Exact D1 UUID is preferred and used for every D1 read/write/readback; live emoji-prefixed Lark tables resolve to exact IDs and records are matched locally from NDJSON exports.");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!out.baseToken.trim()) throw new Error("--base-token is required");
  if (!out.caseId.trim()) throw new Error("--case-id is required");
  if (!/^case_[A-Za-z0-9-]+$/.test(out.caseId)) throw new Error("--case-id has unexpected format");
  if (out.databaseId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(out.databaseId)) {
    throw new Error("--database-id must be a D1 UUID");
  }
  if (out.database && !/^[A-Za-z0-9_-]+$/.test(out.database)) throw new Error("--database has unexpected format");
  if (!out.databaseId && !out.database) throw new Error("--database-id is required (legacy --database name is accepted only as fallback)");
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

function runLark(args, label, options = {}) {
  return run("lark-cli", [...args, "--as", "user"], label, options);
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

function safeName(value) {
  return String(value || "table").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "table";
}

function exportRecords(baseToken, table, fields, tempDir, suffix) {
  const relativePath = `${tempDir}/${safeName(table.displayName)}-${suffix}.ndjson`;
  const command = [
    "base", "+record-list",
    "--base-token", baseToken,
    "--table-id", table.id,
  ];
  for (const field of fields) command.push("--field-id", field);
  command.push(
    "--limit", "2000",
    "--output", relativePath,
    "--overwrite",
    "--minimal-stdout",
  );
  const result = runLark(command, `Export ${table.displayName} ${suffix}`, { requireOk: false });
  if (!result || typeof result.has_more !== "boolean") {
    throw new Error(`Export ${table.displayName} ${suffix} returned invalid minimal result${result?.raw ? `: ${String(result.raw).slice(0, 800)}` : ""}`);
  }
  if (result.has_more === true) throw new Error(`${table.displayName} has more than 2000 records; refusing partial recovery`);
  const text = readFileSync(resolve(relativePath), "utf8");
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row && typeof row === "object" && !Array.isArray(row)) rows.push(row);
  }
  return rows;
}

function exactOne(records, label) {
  if (records.length !== 1) throw new Error(`${label}: expected exactly 1 record, got ${records.length}`);
  return records[0];
}

function fieldText(record, name) {
  const value = record?.[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string") return value[0];
  return value == null ? "" : String(value);
}

function fieldNumber(record, name) {
  const value = record?.[name];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function fieldBoolean(record, name) {
  const value = record?.[name];
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  return false;
}

function assertMutationAccepted(result, label) {
  if (!result || typeof result !== "object" || Array.isArray(result) || typeof result.raw === "string") {
    throw new Error(`${label} returned invalid JSON result${result?.raw ? `: ${String(result.raw).slice(0, 800)}` : ""}`);
  }
  const ignored = Array.isArray(result.ignored_fields) ? result.ignored_fields : [];
  if (ignored.length) throw new Error(`${label} ignored ${ignored.length} field write(s); refusing before readback`);
}

function batchUpdate(baseToken, table, recordId, fields) {
  const result = runLark([
    "base", "+record-batch-update",
    "--base-token", baseToken,
    "--table-id", table.id,
    "--json", JSON.stringify({ update_records: { [recordId]: fields } }),
  ], `Update ${table.displayName}.${recordId}`, { requireOk: false });
  assertMutationAccepted(result, `Update ${table.displayName}.${recordId}`);
}

function wranglerD1Json(databaseRef, sql, label) {
  const result = spawnSync("npx", [
    "wrangler", "d1", "execute", databaseRef,
    "--remote",
    "--command", sql,
    "--json",
  ], {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();
  if (result.status !== 0) throw new Error(`${label} failed (exit ${result.status}): ${(stderr || stdout).slice(0, 2200)}`);
  try { return JSON.parse(stdout || "null"); }
  catch { throw new Error(`${label} returned non-JSON output: ${stdout.slice(0, 1200)}`); }
}

function collectD1Routes(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectD1Routes(item, out);
  } else if (value && typeof value === "object") {
    if (typeof value.case_id === "string" && typeof value.status === "string") out.push(value);
    for (const child of Object.values(value)) collectD1Routes(child, out);
  }
  return out;
}

function d1Route(databaseRef, caseId) {
  const escaped = caseId.replaceAll("'", "''");
  const payload = wranglerD1Json(
    databaseRef,
    `SELECT case_id,line_user_id,customer_id,customer_record_id,tracking_record_id,deal_record_id,status FROM case_routes WHERE case_id='${escaped}' LIMIT 1;`,
    "Read D1 case route",
  );
  const rows = collectD1Routes(payload).filter((row) => row.case_id === caseId);
  return exactOne(rows, "D1 case route");
}

function changedCustomer(before, target) {
  return before.customer_stage !== target.customer_stage
    || before.customer_lead_quality !== target.customer_lead_quality
    || before.customer_lead_score !== target.customer_lead_score
    || before.customer_hot_lead !== target.customer_hot_lead;
}

function changedCase(before, target) {
  return before.case_status !== target.case_status || before.case_lead_quality !== target.case_lead_quality;
}

function changedDeal(before, target) {
  return before.pipeline_stage !== target.pipeline_stage
    || before.payment_status !== target.payment_status
    || before.qr_sent_at_present !== false;
}

const CUSTOMER_FIELDS = ["customer_id", "customer_stage", "lead_quality", "lead_score", "hot_lead"];
const CASE_FIELDS = ["tracking_id", "record_type", "case_id", "customer_id", "case_status", "lead_quality"];
const DEAL_FIELDS = ["deal_id", "case_id", "customer_id", "deal_status", "pipeline_stage", "payment_status", "qr_sent_at"];

const args = parseArgs(process.argv.slice(2));
verifyAuth();
const databaseRef = args.databaseId || args.database;
const d1Resolution = args.databaseId ? "exact_database_uuid" : "legacy_database_name";
const tempDir = `.tmp-failed-qr-recovery-${process.pid}`;
mkdirSync(tempDir, { recursive: true });

try {
  const liveTables = listTables(args.baseToken);
  const customersTable = resolveCanonicalNamedResource(liveTables, "Customers", "table");
  const chatTable = resolveCanonicalNamedResource(liveTables, "Chat_Tracking", "table");
  const dealsTable = resolveCanonicalNamedResource(liveTables, "Sales_Deals", "table");
  const d1Before = d1Route(databaseRef, args.caseId);

  if (!["PAYMENT", "QUOTED"].includes(String(d1Before.status))) {
    throw new Error(`Refusing recovery: D1 status=${String(d1Before.status)}; expected PAYMENT/QUOTED`);
  }
  for (const key of ["customer_record_id", "tracking_record_id", "deal_record_id"]) {
    if (typeof d1Before[key] !== "string" || !d1Before[key].trim()) {
      throw new Error(`Refusing recovery: D1 ${key} is missing`);
    }
  }

  const customerRows = exportRecords(args.baseToken, customersTable, CUSTOMER_FIELDS, tempDir, "before");
  const caseRows = exportRecords(args.baseToken, chatTable, CASE_FIELDS, tempDir, "before");
  const dealRows = exportRecords(args.baseToken, dealsTable, DEAL_FIELDS, tempDir, "before");

  const customerRow = exactOne(customerRows.filter((row) => row.record_id === d1Before.customer_record_id), "Customers exact D1 record");
  const caseRow = exactOne(caseRows.filter((row) => row.record_id === d1Before.tracking_record_id), "Chat_Tracking exact D1 record");
  const dealRow = exactOne(dealRows.filter((row) => row.record_id === d1Before.deal_record_id), "Sales_Deals exact D1 record");

  if (fieldText(customerRow, "customer_id") !== String(d1Before.customer_id)) throw new Error("Refusing recovery: Customers customer_id does not match D1");
  if (fieldText(caseRow, "case_id") !== args.caseId || fieldText(caseRow, "record_type") !== "CASE") throw new Error("Refusing recovery: Chat_Tracking record does not match target CASE");
  if (fieldText(caseRow, "customer_id") !== String(d1Before.customer_id)) throw new Error("Refusing recovery: Chat_Tracking customer_id does not match D1");
  if (fieldText(dealRow, "case_id") !== args.caseId || fieldText(dealRow, "customer_id") !== String(d1Before.customer_id)) throw new Error("Refusing recovery: Sales_Deals identity does not match D1");

  const before = {
    customer_stage: fieldText(customerRow, "customer_stage"),
    customer_lead_quality: fieldText(customerRow, "lead_quality"),
    customer_lead_score: fieldNumber(customerRow, "lead_score"),
    customer_hot_lead: fieldBoolean(customerRow, "hot_lead"),
    case_status: fieldText(caseRow, "case_status"),
    case_lead_quality: fieldText(caseRow, "lead_quality"),
    deal_status: fieldText(dealRow, "deal_status"),
    pipeline_stage: fieldText(dealRow, "pipeline_stage"),
    payment_status: fieldText(dealRow, "payment_status"),
    qr_sent_at_present: Boolean(dealRow.qr_sent_at),
    d1_status: String(d1Before.status),
  };

  if (before.deal_status !== "Open") throw new Error(`Refusing recovery: deal_status=${before.deal_status}`);
  if (!["PAYMENT", "QUOTED"].includes(before.case_status)) throw new Error(`Refusing recovery: case_status=${before.case_status}; expected PAYMENT/QUOTED`);
  if (!["QR Sent", "Pending QR Send", "Pending"].includes(before.payment_status)) {
    throw new Error(`Refusing recovery: payment_status=${before.payment_status}; expected QR Sent/Pending QR Send/Pending`);
  }

  const target = {
    customer_stage: "📄 Quotation Sent",
    customer_lead_quality: "⚡ High Intent",
    customer_lead_score: 60,
    customer_hot_lead: false,
    case_status: "QUOTED",
    case_lead_quality: "⚡ High Intent",
    pipeline_stage: "Quotation",
    payment_status: "Pending",
    qr_sent_at: null,
    d1_status: "QUOTED",
  };

  const resolvedTables = {
    Customers: { name: customersTable.displayName, id: customersTable.id },
    Chat_Tracking: { name: chatTable.displayName, id: chatTable.id },
    Sales_Deals: { name: dealsTable.displayName, id: dealsTable.id },
  };
  const planned = {
    customer: changedCustomer(before, target),
    case_tracking: changedCase(before, target),
    deal: changedDeal(before, target),
    d1: before.d1_status !== target.d1_status,
  };

  if (!args.apply) {
    console.log(JSON.stringify({
      ok: true,
      mode: "plan",
      mutation_count: 0,
      case_id: args.caseId,
      customer_id: d1Before.customer_id,
      d1_resolution: d1Resolution,
      record_resolution: "d1_exact_record_ids_plus_local_ndjson_readback",
      resolved_tables: resolvedTables,
      records: {
        customer: customerRow.record_id,
        case_tracking: caseRow.record_id,
        deal: dealRow.record_id,
      },
      before,
      target,
      planned_mutations: planned,
    }, null, 2));
    process.exit(0);
  }

  let mutationCount = 0;
  if (planned.customer) {
    batchUpdate(args.baseToken, customersTable, customerRow.record_id, {
      customer_stage: target.customer_stage,
      lead_quality: target.customer_lead_quality,
      lead_score: target.customer_lead_score,
      hot_lead: target.customer_hot_lead,
    });
    mutationCount += 1;
  }
  if (planned.case_tracking) {
    batchUpdate(args.baseToken, chatTable, caseRow.record_id, {
      case_status: target.case_status,
      lead_quality: target.case_lead_quality,
    });
    mutationCount += 1;
  }
  if (planned.deal) {
    batchUpdate(args.baseToken, dealsTable, dealRow.record_id, {
      pipeline_stage: target.pipeline_stage,
      payment_status: target.payment_status,
      qr_sent_at: null,
    });
    mutationCount += 1;
  }
  if (planned.d1) {
    const escapedCaseId = args.caseId.replaceAll("'", "''");
    wranglerD1Json(
      databaseRef,
      `UPDATE case_routes SET status='QUOTED', card_version=card_version+1, updated_at=${Date.now()} WHERE case_id='${escapedCaseId}' AND status='PAYMENT';`,
      "Reset D1 case route",
    );
    mutationCount += 1;
  }

  const customerAfterRows = exportRecords(args.baseToken, customersTable, CUSTOMER_FIELDS, tempDir, "after");
  const caseAfterRows = exportRecords(args.baseToken, chatTable, CASE_FIELDS, tempDir, "after");
  const dealAfterRows = exportRecords(args.baseToken, dealsTable, DEAL_FIELDS, tempDir, "after");
  const customerAfter = exactOne(customerAfterRows.filter((row) => row.record_id === customerRow.record_id), "Customers readback");
  const caseAfter = exactOne(caseAfterRows.filter((row) => row.record_id === caseRow.record_id), "Chat_Tracking readback");
  const dealAfter = exactOne(dealAfterRows.filter((row) => row.record_id === dealRow.record_id), "Sales_Deals readback");
  const d1After = d1Route(databaseRef, args.caseId);

  const actual = {
    customer_stage: fieldText(customerAfter, "customer_stage"),
    customer_lead_quality: fieldText(customerAfter, "lead_quality"),
    customer_lead_score: fieldNumber(customerAfter, "lead_score"),
    customer_hot_lead: fieldBoolean(customerAfter, "hot_lead"),
    case_status: fieldText(caseAfter, "case_status"),
    case_lead_quality: fieldText(caseAfter, "lead_quality"),
    pipeline_stage: fieldText(dealAfter, "pipeline_stage"),
    payment_status: fieldText(dealAfter, "payment_status"),
    qr_sent_at_present: Boolean(dealAfter.qr_sent_at),
    d1_status: String(d1After.status),
  };

  if (
    actual.customer_stage !== target.customer_stage ||
    actual.customer_lead_quality !== target.customer_lead_quality ||
    actual.customer_lead_score !== target.customer_lead_score ||
    actual.customer_hot_lead !== target.customer_hot_lead ||
    actual.case_status !== target.case_status ||
    actual.case_lead_quality !== target.case_lead_quality ||
    actual.pipeline_stage !== target.pipeline_stage ||
    actual.payment_status !== target.payment_status ||
    actual.qr_sent_at_present ||
    actual.d1_status !== target.d1_status
  ) {
    throw new Error(`Recovery readback mismatch: ${JSON.stringify(actual)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    mode: "apply",
    mutation_count: mutationCount,
    case_id: args.caseId,
    customer_id: d1Before.customer_id,
    d1_resolution: d1Resolution,
    record_resolution: "d1_exact_record_ids_plus_local_ndjson_readback",
    resolved_tables: resolvedTables,
    before,
    after: actual,
    status: "FAILED_QR_TEST_ROLLED_BACK_TO_LAST_VERIFIED_QUOTED_STATE",
  }, null, 2));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
