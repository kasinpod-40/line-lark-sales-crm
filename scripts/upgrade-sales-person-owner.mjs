#!/usr/bin/env node

import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const SALES_FIELD = { name: "sales", type: "user", multiple: false };
const TABLES = [
  { key: "customers", label: "Customers", sourceField: "assigned_sales_id" },
  { key: "chat", label: "Chat_Tracking", sourceField: "assigned_sales_id" },
  { key: "deals", label: "Sales_Deals", sourceField: "sales_id" },
];

function parseArgs(argv) {
  const args = {
    apply: false,
    baseToken: "",
    tableIds: { customers: "", chat: "", deals: "" },
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--base-token") args.baseToken = argv[++i] || "";
    else if (arg === "--customers-table-id") args.tableIds.customers = argv[++i] || "";
    else if (arg === "--chat-table-id") args.tableIds.chat = argv[++i] || "";
    else if (arg === "--deals-table-id") args.tableIds.deals = argv[++i] || "";
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:\n  node scripts/upgrade-sales-person-owner.mjs\n  node scripts/upgrade-sales-person-owner.mjs --apply \\\n    --base-token <base_token> \\\n    --customers-table-id <table_id> \\\n    --chat-table-id <table_id> \\\n    --deals-table-id <table_id>\n\nDefault mode is plan-only and performs zero Lark mutations.\nApply mode uses the three concrete table IDs, creates only the missing single-person 'sales' field,\nand backfills it from the existing technical open-id field. No table/view/formula/record is deleted.`);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.apply) {
    if (!args.baseToken.trim()) throw new Error("--base-token is required with --apply");
    for (const table of TABLES) {
      if (!args.tableIds[table.key]?.trim()) throw new Error(`--${table.key === "customers" ? "customers-table-id" : table.key === "chat" ? "chat-table-id" : "deals-table-id"} is required with --apply`);
    }
  }
  return args;
}

function cliEnv() {
  return {
    ...process.env,
    LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
    LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1",
  };
}

function runRaw(args, label, { json = true, requireOk = true } = {}) {
  const result = spawnSync("lark-cli", args, {
    encoding: "utf8",
    env: cliEnv(),
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) {
    if (result.error.code === "ENOENT") throw new Error("lark-cli is not installed or not on PATH");
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    throw new Error(`${label} failed (exit ${result.status}): ${detail.slice(0, 2000)}`);
  }
  const stdout = String(result.stdout || "").trim();
  if (!json) return stdout;
  if (!stdout) throw new Error(`${label} returned empty output`);
  let parsed;
  try { parsed = JSON.parse(stdout); }
  catch { throw new Error(`${label} returned non-JSON output: ${stdout.slice(0, 1000)}`); }
  if (requireOk && parsed?.ok !== true) throw new Error(`${label} returned JSON without ok=true`);
  return parsed;
}

function runLark(args, label, options = {}) {
  return runRaw([...args, "--as", "user"], label, options);
}

function verifyAuth() {
  const status = runRaw(["auth", "status", "--json", "--verify"], "Lark user auth status", { requireOk: false });
  if (status?.identity !== "user" || status?.verified !== true) {
    throw new Error(`Lark user auth is not verified user identity (identity=${String(status?.identity || "none")}, verified=${String(status?.verified)})`);
  }
}

function collectObjects(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, out);
  } else if (value && typeof value === "object") {
    out.push(value);
    for (const child of Object.values(value)) collectObjects(child, out);
  }
  return out;
}

function listFields(baseToken, tableId, label) {
  const response = runLark(
    ["base", "+field-list", "--base-token", baseToken, "--table-id", tableId],
    `List fields ${label}`,
  );
  const map = new Map();
  for (const object of collectObjects(response)) {
    const name = typeof object.name === "string" ? object.name : typeof object.field_name === "string" ? object.field_name : "";
    if (!name || map.has(name)) continue;
    map.set(name, object);
  }
  return map;
}

function normalizedFieldType(field) {
  return typeof field?.type === "string" ? field.type : typeof field?.ui_type === "string" ? field.ui_type : "";
}

function ensureSalesField(baseToken, tableId, label) {
  let fields = listFields(baseToken, tableId, label);
  const existing = fields.get(SALES_FIELD.name);
  if (!existing) {
    runLark([
      "base", "+field-create",
      "--base-token", baseToken,
      "--table-id", tableId,
      "--json", JSON.stringify(SALES_FIELD),
    ], `Create ${label}.sales`);
    fields = listFields(baseToken, tableId, label);
  }
  const sales = fields.get(SALES_FIELD.name);
  if (!sales) throw new Error(`${label}.sales was not discoverable after create`);
  const type = normalizedFieldType(sales);
  if (type && type !== "user") throw new Error(`${label}.sales type mismatch: expected user, got ${type}`);
  if (sales.multiple === true) throw new Error(`${label}.sales must be single-person (multiple=false)`);
  return { created: !existing };
}

function safeArtifactName(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function exportRecords(baseToken, tableId, label, sourceField, tempDir) {
  const relativePath = `${tempDir}/${safeArtifactName(label)}.ndjson`;
  const result = runLark([
    "base", "+record-list",
    "--base-token", baseToken,
    "--table-id", tableId,
    "--field-id", sourceField,
    "--field-id", "sales",
    "--limit", "2000",
    "--output", relativePath,
    "--overwrite",
    "--minimal-stdout",
  ], `Export records ${label}`, { requireOk: false });
  if (!result || typeof result.has_more !== "boolean") {
    throw new Error(`Export records ${label} returned invalid minimal result (missing boolean has_more)`);
  }
  if (result.has_more === true) throw new Error(`${label} has more than 2000 records; refusing partial backfill`);
  const absolute = resolve(relativePath);
  const text = readFileSync(absolute, "utf8");
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row && typeof row === "object") rows.push(row);
  }
  return rows;
}

function currentSalesId(value) {
  if (!Array.isArray(value) || !value.length || !value[0] || typeof value[0] !== "object") return "";
  return typeof value[0].id === "string" ? value[0].id.trim() : "";
}

function assertBatchUpdateAccepted(result, label) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`${label} returned invalid JSON result`);
  }
  const ignored = Array.isArray(result.ignored_fields) ? result.ignored_fields : [];
  if (ignored.length) {
    throw new Error(`${label} ignored ${ignored.length} field write(s); refusing to continue before readback`);
  }
}

function backfillTable(baseToken, tableId, label, sourceField, tempDir) {
  const rows = exportRecords(baseToken, tableId, label, sourceField, tempDir);
  const pending = [];
  let owned = 0;
  let alreadyCorrect = 0;
  for (const row of rows) {
    const recordId = typeof row.record_id === "string" ? row.record_id.trim() : "";
    const ownerId = typeof row[sourceField] === "string" ? row[sourceField].trim() : "";
    if (!recordId || !ownerId) continue;
    owned += 1;
    if (currentSalesId(row.sales) === ownerId) {
      alreadyCorrect += 1;
      continue;
    }
    pending.push({ recordId, ownerId });
  }

  for (let offset = 0; offset < pending.length; offset += 200) {
    const batch = pending.slice(offset, offset + 200);
    const updateRecords = Object.fromEntries(batch.map(({ recordId, ownerId }) => [
      recordId,
      { sales: [{ id: ownerId }] },
    ]));
    const updateResult = runLark([
      "base", "+record-batch-update",
      "--base-token", baseToken,
      "--table-id", tableId,
      "--json", JSON.stringify({ update_records: updateRecords }),
    ], `Backfill ${label}.sales batch ${Math.floor(offset / 200) + 1}`, { requireOk: false });
    assertBatchUpdateAccepted(updateResult, `Backfill ${label}.sales batch ${Math.floor(offset / 200) + 1}`);
  }

  const readback = exportRecords(baseToken, tableId, `${label}-readback`, sourceField, tempDir);
  let verified = 0;
  const mismatches = [];
  for (const row of readback) {
    const recordId = typeof row.record_id === "string" ? row.record_id.trim() : "";
    const ownerId = typeof row[sourceField] === "string" ? row[sourceField].trim() : "";
    if (!recordId || !ownerId) continue;
    if (currentSalesId(row.sales) === ownerId) verified += 1;
    else mismatches.push(recordId);
  }
  if (mismatches.length) throw new Error(`${label}.sales readback mismatch for ${mismatches.length} record(s): ${mismatches.slice(0, 10).join(", ")}`);
  return { records: rows.length, owned, already_correct: alreadyCorrect, updated: pending.length, verified };
}

function plan() {
  console.log(JSON.stringify({
    ok: true,
    mode: "plan",
    mutation_count: 0,
    field: SALES_FIELD,
    tables: TABLES.map(({ label, sourceField }) => ({ table: label, source_field: sourceField })),
    behavior: [
      "create only missing sales:user single-person field",
      "preserve technical sales/open-id and legacy name fields",
      "backfill only records with a non-empty existing owner open_id",
      "read back every owned record and fail on mismatch",
      "no table/view/formula/delete/D1/Queue/R2 mutation",
    ],
  }, null, 2));
}

function apply(args) {
  verifyAuth();
  const tempDir = `.tmp-sales-person-owner-${process.pid}`;
  mkdirSync(tempDir, { recursive: true });
  try {
    const results = [];
    for (const table of TABLES) {
      const tableId = args.tableIds[table.key];
      const field = ensureSalesField(args.baseToken, tableId, table.label);
      const backfill = backfillTable(args.baseToken, tableId, table.label, table.sourceField, tempDir);
      results.push({ table: table.label, table_id: tableId, field_created: field.created, ...backfill });
    }
    console.log(JSON.stringify({
      ok: true,
      mode: "apply",
      contract: "lark_sales_person_owner_upgrade_v1",
      field: SALES_FIELD,
      results,
      totals: {
        field_create_count: results.filter((item) => item.field_created).length,
        record_update_count: results.reduce((sum, item) => sum + item.updated, 0),
        verified_owner_count: results.reduce((sum, item) => sum + item.verified, 0),
      },
    }, null, 2));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const args = parseArgs(process.argv.slice(2));
if (!args.apply) plan();
else apply(args);
