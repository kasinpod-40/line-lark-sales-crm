#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const contractPath = resolve(__dirname, "../deploy/lark-base-contract.json");
const contract = JSON.parse(readFileSync(contractPath, "utf8"));

function parseArgs(argv) {
  const out = {
    apply: false,
    baseToken: "",
    baseName: contract.base_name,
    timeZone: contract.time_zone,
    identity: contract.identity || "user",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") out.apply = true;
    else if (arg === "--base-token") out.baseToken = argv[++i] || "";
    else if (arg === "--base-name") out.baseName = argv[++i] || "";
    else if (arg === "--time-zone") out.timeZone = argv[++i] || "";
    else if (arg === "--identity") out.identity = argv[++i] || "";
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!out.baseName.trim()) throw new Error("--base-name cannot be blank");
  if (!out.timeZone.trim()) throw new Error("--time-zone cannot be blank");
  if (out.identity !== "user") throw new Error("Golden Base provisioning is locked to --identity user");
  return out;
}

function printHelp() {
  console.log(`Usage:\n  npm run lark:base:plan\n  npm run lark:base:apply -- --base-name "LINE OA Sales CRM"\n  npm run lark:base:apply -- --base-token <existing_base_token>\n\nDefault mode is plan-only and performs zero Lark mutations.\n--apply creates/reconciles the three-table contract using lark-cli as the logged-in user.\n--base-token resumes against an existing Base instead of creating a new Base.`);
}

function plan(args) {
  const ordered = [];
  if (!args.baseToken) {
    ordered.push({ action: "create_base", name: args.baseName, first_table: contract.tables[0].name });
  } else {
    ordered.push({ action: "reuse_base", base_token: "<provided>" });
  }
  for (const table of contract.tables) {
    ordered.push({ action: "ensure_table", table: table.name, primary_field: table.primary_field, fields: table.fields.length });
  }
  for (const key of contract.deferred_field_order) ordered.push({ action: "ensure_deferred_field", field: key });
  ordered.push({ action: "verify_exact_three_business_tables", tables: contract.tables.map((table) => table.name) });
  ordered.push({ action: "print_worker_vars", keys: ["LARK_BASE_APP_TOKEN", "LARK_BASE_CUSTOMERS_TABLE_ID", "LARK_BASE_CHAT_TRACKING_TABLE_ID", "LARK_BASE_SALES_DEALS_TABLE_ID"] });
  console.log(JSON.stringify({
    ok: true,
    mode: "plan",
    mutation_count: 0,
    contract_version: contract.contract_version,
    product_release: contract.product_release,
    identity: args.identity,
    base_name: args.baseName,
    time_zone: args.timeZone,
    operations: ordered,
  }, null, 2));
}

function cliEnv() {
  return {
    ...process.env,
    LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
    LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1",
  };
}

function parseJson(text, label) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error(`${label} returned empty output`);
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} returned non-JSON output: ${trimmed.slice(0, 800)}`);
  }
}

function runRaw(args, label, { json = true, requireOk = true } = {}) {
  const result = spawnSync("lark-cli", args, {
    encoding: "utf8",
    env: cliEnv(),
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error("lark-cli is not installed or not on PATH. Install/configure the official Lark CLI before --apply.");
    }
    throw result.error;
  }
  if (result.status !== 0) {
    let detail = String(result.stderr || result.stdout || "").trim();
    try {
      const parsed = JSON.parse(detail);
      const error = parsed?.error || {};
      detail = [error.type, error.subtype, error.message, error.hint, Array.isArray(error.missing_scopes) ? `missing_scopes=${error.missing_scopes.join(",")}` : ""]
        .filter(Boolean)
        .join(" | ");
    } catch {
      // Keep the bounded raw diagnostic below.
    }
    throw new Error(`${label} failed (exit ${result.status}): ${detail.slice(0, 1600)}`);
  }
  if (!json) return String(result.stdout || "").trim();
  const parsed = parseJson(result.stdout, label);
  if (requireOk && parsed?.ok !== true) throw new Error(`${label} returned JSON without ok=true`);
  return parsed;
}

function runLark(args, label) {
  return runRaw([...args, "--as", "user"], label, { json: true, requireOk: true });
}

function verifyUserAuthStatus() {
  const status = runRaw(
    ["auth", "status", "--json", "--verify"],
    "Lark user auth status",
    { json: true, requireOk: false },
  );
  if (status?.identity !== "user") {
    throw new Error(`Lark user auth status is not user-ready: identity=${String(status?.identity || "none")}`);
  }
  if (status?.verified !== true) {
    const detail = typeof status?.verifyError === "string" && status.verifyError.trim()
      ? ` | ${status.verifyError.trim()}`
      : "";
    throw new Error(`Lark user auth status is not verified${detail}`);
  }
  return status;
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

function firstStringByKeys(payload, keys) {
  for (const obj of collectObjects(payload)) {
    for (const key of keys) {
      if (typeof obj[key] === "string" && obj[key].trim()) return obj[key].trim();
    }
  }
  return "";
}

function tableMap(payload) {
  const map = new Map();
  for (const obj of collectObjects(payload)) {
    const name = typeof obj.table_name === "string" ? obj.table_name : typeof obj.name === "string" ? obj.name : "";
    const id = typeof obj.table_id === "string" ? obj.table_id : "";
    if (name && id) map.set(name, { id, raw: obj });
  }
  return map;
}

function fieldMap(payload) {
  const map = new Map();
  for (const obj of collectObjects(payload)) {
    const name = typeof obj.name === "string" ? obj.name : typeof obj.field_name === "string" ? obj.field_name : "";
    const id = typeof obj.field_id === "string" ? obj.field_id : "";
    if (name && id) map.set(name, { id, type: obj.type, raw: obj });
  }
  return map;
}

function expectedFieldType(table, name) {
  const field = [...table.fields, ...(table.deferred_fields || [])].find((item) => item.name === name);
  if (field) return field.type;
  if ((table.generated_backlinks || []).includes(name)) return "link";
  return "";
}

function validateExistingFields(table, fields) {
  if (!fields.has(table.primary_field)) {
    throw new Error(`Existing table ${table.name} does not have required primary field ${table.primary_field}; refusing to create a duplicate or mutate primary identity`);
  }
  for (const [name, actual] of fields.entries()) {
    const expected = expectedFieldType(table, name);
    if (!expected) continue;
    if (typeof actual.type === "string" && actual.type && actual.type !== expected) {
      throw new Error(`Schema mismatch ${table.name}.${name}: expected type ${expected}, got ${actual.type}`);
    }
  }
}

function assertNoUnexpectedTables(tables) {
  const allowed = new Set(contract.tables.map((table) => table.name));
  const unexpected = [...tables.keys()].filter((name) => !allowed.has(name));
  if (unexpected.length) {
    throw new Error(`Base contains unexpected table(s): ${unexpected.join(", ")}. Refusing mutation because the golden contract requires exactly Customers, Chat_Tracking, Sales_Deals.`);
  }
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function listTables(baseToken, requiredNames = []) {
  let last = new Map();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = runLark(["base", "+table-list", "--base-token", baseToken], "Lark table list");
    last = tableMap(response);
    if (requiredNames.every((name) => last.has(name)) || attempt === 5) return last;
    await sleep(800);
  }
  return last;
}

function listFields(baseToken, tableName) {
  const response = runLark(["base", "+field-list", "--base-token", baseToken, "--table-id", tableName], `Lark field list ${tableName}`);
  return fieldMap(response);
}

function createFields(baseToken, tableName, fields, label) {
  if (!fields.length) return;
  const hasFormula = fields.some((field) => field.type === "formula");
  const args = ["base", "+field-create", "--base-token", baseToken, "--table-id", tableName, "--json", JSON.stringify(fields)];
  if (hasFormula) args.push("--i-have-read-guide");
  runLark(args, label);
}

function findDeferredField(key) {
  const [tableName, fieldName] = key.split(".");
  const table = contract.tables.find((item) => item.name === tableName);
  const field = table?.deferred_fields?.find((item) => item.name === fieldName);
  if (!table || !field) throw new Error(`Invalid deferred field order entry: ${key}`);
  return { table, field };
}

async function apply(args) {
  runRaw(["--version"], "lark-cli version", { json: false });
  verifyUserAuthStatus();

  let baseToken = args.baseToken.trim();
  const createdNames = [];
  if (!baseToken) {
    const firstTable = contract.tables[0];
    const response = runLark([
      "base", "+base-create",
      "--name", args.baseName,
      "--time-zone", args.timeZone,
      "--table-name", firstTable.name,
      "--fields", JSON.stringify(firstTable.fields),
    ], "Create golden Lark Base");
    baseToken = firstStringByKeys(response, ["app_token", "base_token"]);
    if (!baseToken) throw new Error("Base was created but lark-cli response did not expose app_token/base_token");
    createdNames.push(firstTable.name);
  }

  let tables = await listTables(baseToken, createdNames);
  // Resume mode must be safe against accidentally pointing at an unrelated Base.
  assertNoUnexpectedTables(tables);
  for (const table of contract.tables) {
    if (tables.has(table.name)) validateExistingFields(table, listFields(baseToken, table.name));
  }

  for (const table of contract.tables) {
    if (!tables.has(table.name)) {
      runLark([
        "base", "+table-create",
        "--base-token", baseToken,
        "--name", table.name,
        "--fields", JSON.stringify(table.fields),
      ], `Create table ${table.name}`);
      createdNames.push(table.name);
      tables = await listTables(baseToken, createdNames);
      if (!tables.has(table.name)) throw new Error(`Table ${table.name} creation returned success but table is not discoverable yet`);
    }
  }

  // Resume-safe reconciliation: existing tables may be partially provisioned.
  for (const table of contract.tables) {
    let fields = listFields(baseToken, table.name);
    validateExistingFields(table, fields);
    const missing = table.fields.filter((field) => field.name !== table.primary_field && !fields.has(field.name));
    if (missing.length) {
      createFields(baseToken, table.name, missing, `Create missing fields in ${table.name}`);
      fields = listFields(baseToken, table.name);
      const stillMissing = missing.filter((field) => !fields.has(field.name));
      if (stillMissing.length) throw new Error(`Missing fields after create in ${table.name}: ${stillMissing.map((field) => field.name).join(", ")}`);
      validateExistingFields(table, fields);
    }
  }

  // Formula fields are created only after all source tables/fields exist.
  for (const key of contract.deferred_field_order) {
    const { table, field } = findDeferredField(key);
    const fields = listFields(baseToken, table.name);
    if (!fields.has(field.name)) {
      createFields(baseToken, table.name, [field], `Create formula ${key}`);
    }
  }

  tables = await listTables(baseToken, contract.tables.map((table) => table.name));
  assertNoUnexpectedTables(tables);
  const missingTables = contract.tables.map((table) => table.name).filter((name) => !tables.has(name));
  if (missingTables.length) throw new Error(`Final table verification failed; missing: ${missingTables.join(", ")}`);

  for (const table of contract.tables) {
    const fields = listFields(baseToken, table.name);
    validateExistingFields(table, fields);
    const expectedNames = [
      ...table.fields.map((field) => field.name),
      ...(table.deferred_fields || []).map((field) => field.name),
      ...(table.generated_backlinks || []),
    ];
    const missing = expectedNames.filter((name) => !fields.has(name));
    if (missing.length) throw new Error(`Final field verification failed in ${table.name}; missing: ${missing.join(", ")}`);
  }

  const result = {
    ok: true,
    mode: "apply",
    contract_version: contract.contract_version,
    product_release: contract.product_release,
    base_name: args.baseName,
    base_token: baseToken,
    tables: Object.fromEntries(contract.tables.map((table) => [table.name, tables.get(table.name)?.id || ""])),
    worker_vars: {
      LARK_BASE_APP_TOKEN: baseToken,
      LARK_BASE_CUSTOMERS_TABLE_ID: tables.get("Customers")?.id || "",
      LARK_BASE_CHAT_TRACKING_TABLE_ID: tables.get("Chat_Tracking")?.id || "",
      LARK_BASE_SALES_DEALS_TABLE_ID: tables.get("Sales_Deals")?.id || "",
    },
    next: "Create/configure the owner-controlled Lark App/Bot and Sales Inbox, then bind these IDs to the existing Cloudflare stack before enabling callbacks.",
  };
  console.log(JSON.stringify(result, null, 2));
}

const args = parseArgs(process.argv.slice(2));
if (!args.apply) {
  plan(args);
} else {
  apply(args).catch((error) => {
    console.error(JSON.stringify({ ok: false, stage: "lark_base_provision", error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exit(1);
  });
}
