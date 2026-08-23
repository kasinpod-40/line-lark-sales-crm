#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { resourceMapFromList, resolveCanonicalNamedResource } from "./lark-cli-resource-list.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaContract = JSON.parse(readFileSync(resolve(__dirname, "../deploy/lark-base-contract.json"), "utf8"));
const uxContract = JSON.parse(readFileSync(resolve(__dirname, "../deploy/lark-base-ux-contract.json"), "utf8"));
const PIPELINE_DISTRIBUTION_BLOCK = "📈 Pipeline Distribution";

function parseArgs(argv) {
  const args = { apply: false, baseToken: "", identity: "user" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--base-token") args.baseToken = argv[++i] || "";
    else if (arg === "--identity") args.identity = argv[++i] || "";
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage:\n  npm run lark:base:reporting:plan\n  npm run lark:base:reporting:apply -- --base-token <existing_base_token>\n\nPlan mode is read-only. Apply updates only the two SLA formula definitions and reconciles the two golden dashboards/23 blocks. Existing live table display names (including emoji prefixes) are resolved to exact table IDs/names before mutation. Views, records, tables and Worker deployment are not touched.");
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

function sleepMs(ms) {
  if (ms <= 0) return;
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, ms);
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

function listTables(baseToken) {
  return mapResources(
    runLark(["base", "+table-list", "--base-token", baseToken], "List Base tables"),
    ["tables"], ["name", "table_name"], ["id", "table_id"], "table",
  );
}

function listFields(baseToken, tableId, label) {
  return mapResources(
    runLark(["base", "+field-list", "--base-token", baseToken, "--table-id", tableId], `List fields ${label}`),
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

function waitForNamed(readMap, name, label) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const map = readMap();
    if (map.has(name) && map.get(name)?.id) return map.get(name);
    if (attempt < 6) sleepMs(800);
  }
  throw new Error(`${label} did not become visible with a concrete id`);
}

function slaFormulaDefinitions() {
  const table = schemaContract.tables.find((item) => item.name === "Chat_Tracking");
  if (!table) throw new Error("Schema contract missing Chat_Tracking");
  const wanted = new Set(["sla_minutes", "sla_status"]);
  const fields = (table.deferred_fields || []).filter((field) => wanted.has(field.name));
  if (fields.length !== 2) throw new Error("Schema contract must contain both Chat_Tracking SLA formulas");
  return fields;
}

function updateSlaFormulas(baseToken, tables) {
  const chatTable = resolveCanonicalNamedResource(tables, "Chat_Tracking", "table");
  const liveFields = listFields(baseToken, chatTable.id, chatTable.displayName);
  let updated = 0;
  for (const field of slaFormulaDefinitions()) {
    const fieldId = requiredId(liveFields, field.name, "Formula field");
    runLark([
      "base", "+field-update",
      "--base-token", baseToken,
      "--table-id", chatTable.id,
      "--field-id", fieldId,
      "--json", JSON.stringify(field),
      "--yes",
      "--i-have-read-guide",
    ], `Update ${chatTable.displayName}.${field.name}`);
    updated += 1;
  }
  return { updated, table_id: chatTable.id, table_name: chatTable.displayName };
}

function liveDashboardDataConfig(dataConfig, tables) {
  const config = JSON.parse(JSON.stringify(dataConfig || {}));
  if (typeof config.table_name === "string" && config.table_name.trim()) {
    const table = resolveCanonicalNamedResource(tables, config.table_name.trim(), "dashboard source table");
    config.table_name = table.displayName;
  }
  return config;
}

function effectiveDashboardDataConfig(block, tables) {
  const config = liveDashboardDataConfig(block.data_config, tables);
  if (block.name === PIPELINE_DISTRIBUTION_BLOCK) {
    // Live Base export proves the ring, table and pipeline_stage group are valid,
    // but Lark's dashboard engine returns no series for COUNTA on this grouped
    // Sales_Deals block. Use pipeline monetary value instead: it is more useful
    // commercially and exercises the same pipeline_stage segmentation.
    delete config.count_all;
    config.series = [{ field_name: "deal_value_thb", rollup: "SUM" }];
  }
  return config;
}

function createDashboard(baseToken, dashboard) {
  runLark([
    "base", "+dashboard-create",
    "--base-token", baseToken,
    "--name", dashboard.name,
  ], `Create dashboard ${dashboard.name}`);
  return waitForNamed(() => listDashboards(baseToken), dashboard.name, `Dashboard ${dashboard.name}`);
}

function createDashboardBlock(baseToken, dashboardId, block, dataConfig) {
  const args = [
    "base", "+dashboard-block-create",
    "--base-token", baseToken,
    "--dashboard-id", dashboardId,
    "--name", block.name,
    "--type", block.type,
    "--data-config", JSON.stringify(dataConfig),
  ];
  if (block.position) args.push("--position", JSON.stringify(block.position));
  runLark(args, `Create dashboard block ${block.name}`);
  return waitForNamed(() => listDashboardBlocks(baseToken, dashboardId), block.name, `Dashboard block ${block.name}`);
}

function updateDashboardBlock(baseToken, dashboardId, blockId, block, dataConfig) {
  const args = [
    "base", "+dashboard-block-update",
    "--base-token", baseToken,
    "--dashboard-id", dashboardId,
    "--block-id", blockId,
    "--name", block.name,
    "--data-config", JSON.stringify(dataConfig),
  ];
  if (block.position) args.push("--position", JSON.stringify(block.position));
  runLark(args, `Refresh dashboard block ${block.name}`);
}

function reconcileDashboards(baseToken, tables) {
  let dashboardsCreated = 0;
  let blocksCreated = 0;
  let blocksRefreshed = 0;
  let dashboards = listDashboards(baseToken);
  const verification = [];

  for (const dashboard of uxContract.dashboards) {
    let dashboardMeta = dashboards.get(dashboard.name);
    if (!dashboardMeta) {
      dashboardMeta = createDashboard(baseToken, dashboard);
      dashboardsCreated += 1;
      dashboards = listDashboards(baseToken);
    }
    const dashboardId = requiredId(dashboards, dashboard.name, "Dashboard");
    let blocks = listDashboardBlocks(baseToken, dashboardId);

    for (const block of dashboard.blocks) {
      const dataConfig = effectiveDashboardDataConfig(block, tables);
      if (!blocks.has(block.name)) {
        createDashboardBlock(baseToken, dashboardId, block, dataConfig);
        blocksCreated += 1;
        blocks = listDashboardBlocks(baseToken, dashboardId);
      }
      const blockId = requiredId(blocks, block.name, `Dashboard block ${dashboard.name}`);
      updateDashboardBlock(baseToken, dashboardId, blockId, block, dataConfig);
      blocksRefreshed += 1;
    }

    const finalBlocks = listDashboardBlocks(baseToken, dashboardId);
    const missing = dashboard.blocks.map((block) => block.name).filter((name) => !finalBlocks.has(name));
    if (missing.length) throw new Error(`Dashboard ${dashboard.name} still missing blocks after reconcile: ${missing.join(", ")}`);
    verification.push({
      name: dashboard.name,
      expected_blocks: dashboard.blocks.length,
      present_expected_blocks: dashboard.blocks.filter((block) => finalBlocks.has(block.name)).length,
      live_block_count: finalBlocks.size,
    });
  }

  return { dashboardsCreated, blocksCreated, blocksRefreshed, verification };
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
    live_table_resolution: "canonical schema name -> exact live table ID/display name (emoji-safe)",
    pipeline_distribution_metric: "SUM(deal_value_thb) grouped by pipeline_stage",
    apply_scope: "2 SLA formula updates + reconcile exactly 2 golden dashboards / 23 expected blocks",
    excluded_scope: "no table create, no record mutation, no view mutation, no Worker deploy",
  }, null, 2));
}

function apply(args) {
  verifyUserAuthStatus();
  const baseToken = args.baseToken.trim();
  const tables = listTables(baseToken);
  const requiredTables = schemaContract.tables.map((table) => table.name);
  const resolvedTables = requiredTables.map((name) => resolveCanonicalNamedResource(tables, name, "table"));
  const sla = updateSlaFormulas(baseToken, tables);
  const dashboards = reconcileDashboards(baseToken, tables);
  const blockExpected = uxContract.dashboards.reduce((sum, dashboard) => sum + dashboard.blocks.length, 0);

  console.log(JSON.stringify({
    ok: true,
    mode: "apply",
    base_token: baseToken,
    resolved_tables: resolvedTables.map((table) => ({ canonical: table.displayName.replace(/^.*?\s(?=[A-Za-z_])/, ""), live_name: table.displayName, table_id: table.id })),
    sla_formulas_updated: sla.updated,
    sla_table: { table_id: sla.table_id, live_name: sla.table_name },
    dashboards_expected: uxContract.dashboards.length,
    blocks_expected: blockExpected,
    dashboards_created: dashboards.dashboardsCreated,
    dashboard_blocks_created: dashboards.blocksCreated,
    dashboard_blocks_refreshed: dashboards.blocksRefreshed,
    pipeline_distribution_metric: "SUM(deal_value_thb) grouped by pipeline_stage",
    dashboard_verification: dashboards.verification,
    no_table_create: true,
    no_record_mutation: true,
    no_view_mutation: true,
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
