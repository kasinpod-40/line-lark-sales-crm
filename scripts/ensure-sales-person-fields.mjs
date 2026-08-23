#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const SALES_FIELD = { name: "sales", type: "user", multiple: false };
const TABLES = [
  { key: "customers", label: "Customers" },
  { key: "chat", label: "Chat_Tracking" },
  { key: "deals", label: "Sales_Deals" },
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
      console.log(`Usage:\n  node scripts/ensure-sales-person-fields.mjs\n  node scripts/ensure-sales-person-fields.mjs --apply \\\n    --base-token <base_token> \\\n    --customers-table-id <table_id> \\\n    --chat-table-id <table_id> \\\n    --deals-table-id <table_id>\n\nDefault mode is plan-only and performs zero Lark mutations.\nApply mode creates only the missing single-person 'sales' field in the three existing business tables.\nIt never reads or mutates record owner values; Person assignment is runtime-owned by the LINE OA Sales CRM Lark App so callback open_id and Base writes share the same app identity namespace.`);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.apply) {
    if (!args.baseToken.trim()) throw new Error("--base-token is required with --apply");
    for (const table of TABLES) {
      if (!args.tableIds[table.key]?.trim()) {
        const flag = table.key === "customers" ? "customers-table-id" : table.key === "chat" ? "chat-table-id" : "deals-table-id";
        throw new Error(`--${flag} is required with --apply`);
      }
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

function runRaw(args, label, { requireOk = true } = {}) {
  const result = spawnSync("lark-cli", args, {
    encoding: "utf8",
    env: cliEnv(),
    maxBuffer: 16 * 1024 * 1024,
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
  let created = false;
  if (!existing) {
    runLark([
      "base", "+field-create",
      "--base-token", baseToken,
      "--table-id", tableId,
      "--json", JSON.stringify(SALES_FIELD),
    ], `Create ${label}.sales`);
    created = true;
    fields = listFields(baseToken, tableId, label);
  }
  const sales = fields.get(SALES_FIELD.name);
  if (!sales) throw new Error(`${label}.sales was not discoverable after create`);
  const type = normalizedFieldType(sales);
  if (type && type !== "user") throw new Error(`${label}.sales type mismatch: expected user, got ${type}`);
  if (sales.multiple === true) throw new Error(`${label}.sales must be single-person (multiple=false)`);
  return { table: label, table_id: tableId, field_created: created, verified: true };
}

function plan() {
  console.log(JSON.stringify({
    ok: true,
    mode: "plan",
    mutation_count: 0,
    field: SALES_FIELD,
    tables: TABLES.map(({ label }) => label),
    behavior: [
      "create only missing sales:user single-person field",
      "reuse and validate an existing sales field",
      "zero record reads and zero record mutations",
      "runtime Custom App is the only authority that writes Person owner values",
      "no view/formula/delete/D1/Queue/R2 mutation",
    ],
  }, null, 2));
}

function apply(args) {
  verifyAuth();
  const results = TABLES.map((table) => ensureSalesField(args.baseToken, args.tableIds[table.key], table.label));
  console.log(JSON.stringify({
    ok: true,
    mode: "apply",
    contract: "lark_sales_person_field_only_v1",
    field: SALES_FIELD,
    record_mutation_count: 0,
    results,
    totals: {
      field_create_count: results.filter((item) => item.field_created).length,
      field_verified_count: results.filter((item) => item.verified).length,
      record_mutation_count: 0,
    },
    next: "Deploy the Person-aware Worker, then send one new LINE message in the claimed case so Customers.sales and Chat_Tracking.sales are written by the same Lark App identity that emitted the card callback open_id.",
  }, null, 2));
}

const args = parseArgs(process.argv.slice(2));
if (!args.apply) plan();
else apply(args);
