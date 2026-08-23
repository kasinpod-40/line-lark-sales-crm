#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { resourceMapFromList } from "./lark-cli-resource-list.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaContract = JSON.parse(readFileSync(resolve(__dirname, "../deploy/lark-base-contract.json"), "utf8"));
const uxContract = JSON.parse(readFileSync(resolve(__dirname, "../deploy/lark-base-ux-contract.json"), "utf8"));
const uxProvisioner = resolve(__dirname, "./provision-lark-base-ux.mjs");

function parseArgs(argv) {
  const args = { apply: false, baseToken: "", identity: "user" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--base-token") args.baseToken = argv[++i] || "";
    else if (arg === "--identity") args.identity = argv[++i] || "";
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage:\n  npm run lark:base:reporting:plan\n  npm run lark:base:reporting:apply -- --base-token <existing_base_token>\n\nPlan mode is read-only. Apply updates only the two SLA formula definitions, runs the existing UX reconciler, then refreshes all dashboard block data_config/positions from the golden UX contract.");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.identity !== "user") throw new Error("Reporting reconciliation is locked to --identity user");
  if (args.apply && !args.baseToken.trim()) throw new Error("--base-token is required with --apply");
  return args;
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
  try { return JSON.parse(trimmed); }
  catch { throw new Error(`${label} returned non-JSON output: ${trimmed.slice(0, 1000)}`); }
}

function runRaw(args, label, { requireOk = true } = {}) {
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
    throw new Error(`${label} failed (exit ${result.status}): ${String(result.stderr || result.stdout || "").trim().slice(0, 2400)}`);
  }
  const parsed = parseJson(result.stdout, label);
  if (requireOk && parsed?.ok !== true) throw new Error(`${label} returned JSON without ok=true`);
  return parsed;
}

function runLark(args, label) {
  return runRaw([...args, "--as", "user"], label);
}

function verifyUserAuthStatus() {
  const status = runRaw(["auth", "status", "--json", "--verify"], "Lark user auth status", { requireOk: false });
  if (status?.identity !== "user") throw new Error(`Lark user auth status is not user-ready: identity=${String(status?.identity || "none")}`);
  if (status?.verified !== true) throw new Error(`Lark user auth status is not verified${status?.verifyError ? ` | ${status.verifyError}` : ""}`);
}

function mapResources(payload, collectionKeys, nameKeys, idKeys, label) {
  return resourceMapFromList(payload, { collectionKeys, nameKeys, idKeys, label });
}

function listFields(baseToken, tableName) {
  return mapResources(
    runLark(["base", "+field-list", "--base-token", baseToken, "--table-id", tableName], `List fields ${tableName}`),
    ["fields"], ["name", "field_name"], ["id", "field_id"], "field",
  );
}

function listDashboards(baseToken) {
  return mapResources(
    runLark(["base", "+dashboard-list", "--base-token", baseToken, "--page-size", "100"], "List dashboards"),
    ["items", "dashboards"], ["name", "dashboard_name"], ["dashboard_id", "id"], "dashboard",
  );
}

function listDashboardBlocks(baseToken, dashboardId) {
  return mapResources(
    runLark(["base", "+dashboard-block-list", "--base-token", baseToken, "--dashboard-id", dashboardId, "--page-size", "100"], `List dashboard blocks ${dashboardId}`),
    ["items", "blocks"], ["name", "block_name"], ["block_id", "id"], "dashboard block",
  );
}

function requiredId(map, name, label) {
  const id = map.get(name)?.id;
  if (typeof id !== "string" || !id.trim()) throw new Error(`${label} ${name} is missing or has no concrete id`);
  return id.trim();
}

function slaFormulaDefinitions() {
  const table = schemaContract.tables.find((item) => item.name === "Chat_Tracking");
  if (!table) throw new Error("Schema contract missing Chat_Tracking");
  const wanted = new Set(["sla_minutes", "sla_status"]);
  const fields = (table.deferred_fields || []).filter((field) => wanted.has(field.name));
  if (fields.length !== 2) throw new Error("Schema contract must contain both Chat_Tracking SLA formulas");
  return fields;
}

function updateSlaFormulas(baseToken) {
  const liveFields = listFields(baseToken, "Chat_Tracking");
  let updated = 0;
  for (const field of slaFormulaDefinitions()) {
    const fieldId = requiredId(liveFields, field.name, "Formula field");
    runLark([
      "base", "+field-update",
      "--base-token", baseToken,
      "--table-id", "Chat_Tracking",
      "--field-id", fieldId,
      "--json", JSON.stringify(field),
      "--yes",
      "--i-have-read-guide",
    ], `Update Chat_Tracking.${field.name}`);
    updated += 1;
  }
  return updated;
}

function runExistingUxReconciler(baseToken) {
  const result = spawnSync(process.execPath, [uxProvisioner, "--apply", "--base-token", baseToken], {
    cwd: resolve(__dirname, ".."),
    encoding: "utf8",
    env: cliEnv(),
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Existing UX reconciler failed: ${String(result.stderr || result.stdout || "").trim().slice(0, 3000)}`);
  }
  return parseJson(result.stdout, "Existing UX reconciler");
}

function refreshDashboardBlocks(baseToken) {
  const dashboards = listDashboards(baseToken);
  let updated = 0;
  const verification = [];

  for (const dashboard of uxContract.dashboards) {
    const dashboardId = requiredId(dashboards, dashboard.name, "Dashboard");
    const blocks = listDashboardBlocks(baseToken, dashboardId);

    for (const block of dashboard.blocks) {
      const blockId = requiredId(blocks, block.name, `Dashboard block ${dashboard.name}`);
      const args = [
        "base", "+dashboard-block-update",
        "--base-token", baseToken,
        "--dashboard-id", dashboardId,
        "--block-id", blockId,
        "--name", block.name,
        "--data-config", JSON.stringify(block.data_config),
      ];
      if (block.position) args.push("--position", JSON.stringify(block.position));
      runLark(args, `Refresh dashboard block ${dashboard.name}.${block.name}`);
      updated += 1;
    }

    const finalBlocks = listDashboardBlocks(baseToken, dashboardId);
    const missing = dashboard.blocks.map((block) => block.name).filter((name) => !finalBlocks.has(name));
    if (missing.length) throw new Error(`Dashboard ${dashboard.name} still missing blocks after refresh: ${missing.join(", ")}`);
    verification.push({
      name: dashboard.name,
      expected_blocks: dashboard.blocks.length,
      present_expected_blocks: dashboard.blocks.filter((block) => finalBlocks.has(block.name)).length,
      live_block_count: finalBlocks.size,
    });
  }

  return { updated, verification };
}

function plan() {
  const dashboardBlockCount = uxContract.dashboards.reduce((sum, dashboard) => sum + dashboard.blocks.length, 0);
  console.log(JSON.stringify({
    ok: true,
    mode: "plan",
    mutation_count: 0,
    contract_version: uxContract.contract_version,
    sla_formulas: slaFormulaDefinitions().map((field) => ({ name: field.name, expression: field.expression })),
    dashboards: uxContract.dashboards.map((dashboard) => ({ name: dashboard.name, blocks: dashboard.blocks.length })),
    dashboard_count: uxContract.dashboards.length,
    dashboard_block_count: dashboardBlockCount,
    apply_scope: "2 SLA formula updates + existing UX reconciler + refresh expected dashboard blocks only",
  }, null, 2));
}

function apply(args) {
  verifyUserAuthStatus();
  const baseToken = args.baseToken.trim();
  const slaFormulasUpdated = updateSlaFormulas(baseToken);
  const ux = runExistingUxReconciler(baseToken);
  const dashboards = refreshDashboardBlocks(baseToken);
  console.log(JSON.stringify({
    ok: true,
    mode: "apply",
    base_token: baseToken,
    sla_formulas_updated: slaFormulasUpdated,
    ux_reconciler: {
      views_expected: ux?.views?.expected,
      dashboards_expected: ux?.dashboards?.expected,
      blocks_expected: ux?.dashboards?.blocks_expected,
    },
    dashboard_blocks_refreshed: dashboards.updated,
    dashboard_verification: dashboards.verification,
    no_table_create: true,
    no_record_mutation: true,
    no_worker_deploy: true,
  }, null, 2));
}

const args = parseArgs(process.argv.slice(2));
try {
  if (!args.apply) plan();
  else apply(args);
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    stage: "lark_base_reporting_reconcile",
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
}
