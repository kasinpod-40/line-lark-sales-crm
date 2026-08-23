#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(readFileSync(resolve(__dirname, "../deploy/lark-base-contract.json"), "utf8"));

function parseArgs(argv) {
  const out = { apply: false, baseToken: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") out.apply = true;
    else if (arg === "--base-token") out.baseToken = argv[++i] || "";
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/reconcile-lark-base-lifecycle-options.mjs [--apply] --base-token <token>\nDefault is read-only plan. Apply updates only Customers.customer_stage and Sales_Deals.pipeline_stage from the canonical contract.");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!out.baseToken.trim()) throw new Error("--base-token is required");
  return out;
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
  const raw = String(result.stdout || result.stderr || "").trim();
  if (result.status !== 0) throw new Error(`${label} failed (exit ${result.status}): ${raw.slice(0, 1800)}`);
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`${label} returned non-JSON output: ${raw.slice(0, 1000)}`); }
  if (requireOk && parsed?.ok !== true) throw new Error(`${label} returned JSON without ok=true`);
  return parsed;
}

function runLark(args, label) {
  return runRaw([...args, "--as", "user"], label);
}

function verifyAuth() {
  const status = runRaw(["auth", "status", "--json", "--verify"], "Lark auth", { requireOk: false });
  if (status?.identity !== "user" || status?.verified !== true) {
    throw new Error(`Lark user auth is not verified: identity=${String(status?.identity || "none")}`);
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

function fieldFromPayload(payload, expectedName) {
  for (const obj of collectObjects(payload)) {
    const name = typeof obj.name === "string" ? obj.name : typeof obj.field_name === "string" ? obj.field_name : "";
    if (name === expectedName) return obj;
  }
  return null;
}

function selectDefinition(tableName, fieldName) {
  const table = contract.tables.find((item) => item.name === tableName);
  const field = table?.fields?.find((item) => item.name === fieldName);
  if (!field || field.type !== "select" || field.multiple !== false || !Array.isArray(field.options)) {
    throw new Error(`Canonical select definition missing: ${tableName}.${fieldName}`);
  }
  return {
    name: field.name,
    type: "select",
    multiple: false,
    options: field.options.map((option) => ({ name: String(option.name) })),
  };
}

function optionNames(field) {
  return Array.isArray(field?.options)
    ? field.options.map((option) => String(option?.name ?? ""))
    : [];
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

const targets = [
  { table: "Customers", field: "customer_stage" },
  { table: "Sales_Deals", field: "pipeline_stage" },
];

const args = parseArgs(process.argv.slice(2));
verifyAuth();

const plan = [];
for (const target of targets) {
  const desired = selectDefinition(target.table, target.field);
  const beforePayload = runLark([
    "base", "+field-get",
    "--base-token", args.baseToken,
    "--table-id", target.table,
    "--field-id", target.field,
  ], `Read ${target.table}.${target.field}`);
  const before = fieldFromPayload(beforePayload, target.field);
  if (!before) throw new Error(`Could not resolve field ${target.table}.${target.field}`);
  const currentNames = optionNames(before);
  const desiredNames = desired.options.map((option) => option.name);
  const needsUpdate = !sameArray(currentNames, desiredNames);
  plan.push({ table: target.table, field: target.field, current: currentNames, desired: desiredNames, needs_update: needsUpdate });

  if (args.apply && needsUpdate) {
    runLark([
      "base", "+field-update",
      "--base-token", args.baseToken,
      "--table-id", target.table,
      "--field-id", target.field,
      "--json", JSON.stringify(desired),
      "--yes",
    ], `Update ${target.table}.${target.field}`);

    const afterPayload = runLark([
      "base", "+field-get",
      "--base-token", args.baseToken,
      "--table-id", target.table,
      "--field-id", target.field,
    ], `Verify ${target.table}.${target.field}`);
    const after = fieldFromPayload(afterPayload, target.field);
    const afterNames = optionNames(after);
    if (!sameArray(afterNames, desiredNames)) {
      throw new Error(`Readback mismatch ${target.table}.${target.field}: ${JSON.stringify(afterNames)}`);
    }
  }
}

console.log(JSON.stringify({
  ok: true,
  mode: args.apply ? "apply" : "plan",
  contract_version: contract.contract_version,
  mutation_count: args.apply ? plan.filter((item) => item.needs_update).length : 0,
  targets: plan,
}, null, 2));
