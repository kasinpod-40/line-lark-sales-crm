#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaContract = JSON.parse(readFileSync(resolve(__dirname, "../deploy/lark-base-contract.json"), "utf8"));
const uxContract = JSON.parse(readFileSync(resolve(__dirname, "../deploy/lark-base-ux-contract.json"), "utf8"));

function parseArgs(argv) {
  const args = { apply: false, baseToken: "", identity: "user" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--base-token") args.baseToken = argv[++i] || "";
    else if (arg === "--identity") args.identity = argv[++i] || "";
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage:\n  npm run lark:base:ux:plan\n  npm run lark:base:ux:apply -- --base-token <existing_base_token>\n\nPlan mode performs zero Lark mutations. Apply mode reconciles views and dashboards only; it never creates/deletes business tables or fields.");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.identity !== "user") throw new Error("Golden Base UX provisioning is locked to --identity user");
  if (args.apply && !args.baseToken.trim()) throw new Error("--base-token is required with --apply");
  return args;
}

function plan() {
  const viewCount = uxContract.tables.reduce((sum, table) => sum + table.views.length, 0);
  const blockCount = uxContract.dashboards.reduce((sum, dashboard) => sum + dashboard.blocks.length, 0);
  console.log(JSON.stringify({
    ok: true,
    mode: "plan",
    mutation_count: 0,
    contract_version: uxContract.contract_version,
    product_release: uxContract.product_release,
    tables: uxContract.tables.map((table) => ({ name: table.name, views: table.views.length })),
    view_count: viewCount,
    dashboards: uxContract.dashboards.map((dashboard) => ({ name: dashboard.name, blocks: dashboard.blocks.length })),
    dashboard_count: uxContract.dashboards.length,
    dashboard_block_count: blockCount,
    prune_extra_views: uxContract.prune_extra_views === true,
    table_icons: uxContract.table_icons,
    table_icon_delivery: uxContract.table_icon_delivery,
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
  try { return JSON.parse(trimmed); }
  catch { throw new Error(`${label} returned non-JSON output: ${trimmed.slice(0, 800)}`); }
}

function runRaw(args, label, { json = true, requireOk = true } = {}) {
  const result = spawnSync("lark-cli", args, { encoding: "utf8", env: cliEnv(), maxBuffer: 32 * 1024 * 1024 });
  if (result.error) {
    if (result.error.code === "ENOENT") throw new Error("lark-cli is not installed or not on PATH");
    throw result.error;
  }
  if (result.status !== 0) {
    let detail = String(result.stderr || result.stdout || "").trim();
    try {
      const parsed = JSON.parse(detail);
      const error = parsed?.error || {};
      detail = [error.type, error.subtype, error.message, error.hint, Array.isArray(error.missing_scopes) ? `missing_scopes=${error.missing_scopes.join(",")}` : ""].filter(Boolean).join(" | ");
    } catch { /* retain raw detail */ }
    throw new Error(`${label} failed (exit ${result.status}): ${detail.slice(0, 2400)}`);
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
  const status = runRaw(["auth", "status", "--json", "--verify"], "Lark user auth status", { json: true, requireOk: false });
  if (status?.identity !== "user") throw new Error(`Lark user auth status is not user-ready: identity=${String(status?.identity || "none")}`);
  if (status?.verified !== true) throw new Error(`Lark user auth status is not verified${status?.verifyError ? ` | ${status.verifyError}` : ""}`);
}

function collectObjects(value, out = []) {
  if (Array.isArray(value)) for (const item of value) collectObjects(item, out);
  else if (value && typeof value === "object") {
    out.push(value);
    for (const child of Object.values(value)) collectObjects(child, out);
  }
  return out;
}

function getString(obj, keys) {
  for (const key of keys) if (typeof obj?.[key] === "string" && obj[key].trim()) return obj[key].trim();
  return "";
}

function objectMap(payload, { nameKeys, idKeys }) {
  const map = new Map();
  for (const obj of collectObjects(payload)) {
    const name = getString(obj, nameKeys);
    const id = getString(obj, idKeys);
    if (name && !map.has(name)) map.set(name, { id, raw: obj });
  }
  return map;
}

function tableMap(payload) { return objectMap(payload, { nameKeys: ["name", "table_name"], idKeys: ["id", "table_id"] }); }
function fieldMap(payload) { return objectMap(payload, { nameKeys: ["name", "field_name"], idKeys: ["id", "field_id"] }); }
function viewMap(payload) { return objectMap(payload, { nameKeys: ["name", "view_name"], idKeys: ["id", "view_id"] }); }
function dashboardMap(payload) { return objectMap(payload, { nameKeys: ["name", "dashboard_name"], idKeys: ["dashboard_id", "id"] }); }
function blockMap(payload) { return objectMap(payload, { nameKeys: ["name", "block_name"], idKeys: ["block_id", "id"] }); }

function listTables(baseToken) {
  return tableMap(runLark(["base", "+table-list", "--base-token", baseToken], "List Base tables"));
}
function listFields(baseToken, table) {
  return fieldMap(runLark(["base", "+field-list", "--base-token", baseToken, "--table-id", table], `List fields ${table}`));
}
function listViews(baseToken, table) {
  return viewMap(runLark(["base", "+view-list", "--base-token", baseToken, "--table-id", table, "--limit", "200"], `List views ${table}`));
}
function listDashboards(baseToken) {
  return dashboardMap(runLark(["base", "+dashboard-list", "--base-token", baseToken, "--page-size", "100"], "List dashboards"));
}
function listDashboardBlocks(baseToken, dashboardId) {
  return blockMap(runLark(["base", "+dashboard-block-list", "--base-token", baseToken, "--dashboard-id", dashboardId, "--page-size", "100"], `List dashboard blocks ${dashboardId}`));
}

function expectedFieldNames(tableName) {
  const table = schemaContract.tables.find((item) => item.name === tableName);
  if (!table) throw new Error(`UX contract references unknown table ${tableName}`);
  return new Set([
    ...table.fields.map((field) => field.name),
    ...(table.deferred_fields || []).map((field) => field.name),
    ...(table.generated_backlinks || []),
  ]);
}

function verifySchema(baseToken) {
  const tables = listTables(baseToken);
  const expectedTables = schemaContract.tables.map((table) => table.name);
  const missingTables = expectedTables.filter((name) => !tables.has(name));
  const unexpectedTables = [...tables.keys()].filter((name) => !expectedTables.includes(name));
  if (missingTables.length || unexpectedTables.length) {
    throw new Error(`UX apply requires exact three-table Base; missing=[${missingTables.join(", ")}], unexpected=[${unexpectedTables.join(", ")}]`);
  }
  for (const tableName of expectedTables) {
    const actual = listFields(baseToken, tableName);
    const expected = expectedFieldNames(tableName);
    const missing = [...expected].filter((name) => !actual.has(name));
    if (missing.length) throw new Error(`UX apply requires completed schema; ${tableName} missing fields: ${missing.join(", ")}`);
  }
}

function createView(baseToken, table, view) {
  runLark(["base", "+view-create", "--base-token", baseToken, "--table-id", table, "--json", JSON.stringify({ name: view.name, type: view.type })], `Create view ${table}.${view.name}`);
}

function renameView(baseToken, table, from, to) {
  runLark(["base", "+view-rename", "--base-token", baseToken, "--table-id", table, "--view-id", from, "--name", to], `Rename view ${table}.${from}`);
}

function setViewConfig(baseToken, table, view) {
  const common = ["base-token", baseToken, "table-id", table, "view-id", view.name];
  const invoke = (command, json, label) => runLark([
    "base", command,
    "--base-token", baseToken,
    "--table-id", table,
    "--view-id", view.name,
    "--json", JSON.stringify(json),
  ], `${label} ${table}.${view.name}`);
  if (view.visible_fields) invoke("+view-set-visible-fields", { visible_fields: view.visible_fields }, "Set visible fields");
  if (view.filter) invoke("+view-set-filter", view.filter, "Set filter");
  if (view.group) invoke("+view-set-group", view.group, "Set group");
  if (view.sort) invoke("+view-set-sort", view.sort, "Set sort");
  void common;
}

function deleteView(baseToken, table, viewRef) {
  runLark(["base", "+view-delete", "--base-token", baseToken, "--table-id", table, "--view-id", viewRef, "--yes"], `Delete extra view ${table}.${viewRef}`);
}

function reconcileViews(baseToken) {
  let created = 0;
  let renamed = 0;
  let deleted = 0;
  for (const tableContract of uxContract.tables) {
    let existing = listViews(baseToken, tableContract.name);
    const desiredNames = new Set(tableContract.views.map((view) => view.name));
    const first = tableContract.views[0];
    if (!existing.has(first.name)) {
      const reusable = [...existing.entries()].find(([name]) => !desiredNames.has(name));
      if (reusable) {
        renameView(baseToken, tableContract.name, reusable[1].id || reusable[0], first.name);
        renamed += 1;
        existing = listViews(baseToken, tableContract.name);
      }
    }
    for (const view of tableContract.views) {
      if (!existing.has(view.name)) {
        createView(baseToken, tableContract.name, view);
        created += 1;
        existing = listViews(baseToken, tableContract.name);
      }
      setViewConfig(baseToken, tableContract.name, view);
    }
    if (uxContract.prune_extra_views === true) {
      existing = listViews(baseToken, tableContract.name);
      for (const [name, meta] of existing.entries()) {
        if (!desiredNames.has(name)) {
          deleteView(baseToken, tableContract.name, meta.id || name);
          deleted += 1;
        }
      }
    }
    const finalViews = listViews(baseToken, tableContract.name);
    const missing = tableContract.views.map((view) => view.name).filter((name) => !finalViews.has(name));
    const extras = [...finalViews.keys()].filter((name) => !desiredNames.has(name));
    if (missing.length || (uxContract.prune_extra_views === true && extras.length)) {
      throw new Error(`View reconciliation failed for ${tableContract.name}; missing=[${missing.join(", ")}], extras=[${extras.join(", ")}]`);
    }
  }
  return { created, renamed, deleted };
}

function createDashboard(baseToken, dashboard) {
  runLark(["base", "+dashboard-create", "--base-token", baseToken, "--name", dashboard.name], `Create dashboard ${dashboard.name}`);
}

function createDashboardBlock(baseToken, dashboardId, block) {
  const args = [
    "base", "+dashboard-block-create",
    "--base-token", baseToken,
    "--dashboard-id", dashboardId,
    "--name", block.name,
    "--type", block.type,
    "--data-config", JSON.stringify(block.data_config),
  ];
  if (block.position) args.push("--position", JSON.stringify(block.position));
  runLark(args, `Create dashboard block ${block.name}`);
}

function reconcileDashboards(baseToken) {
  let dashboardsCreated = 0;
  let blocksCreated = 0;
  let dashboards = listDashboards(baseToken);
  for (const dashboard of uxContract.dashboards) {
    if (!dashboards.has(dashboard.name)) {
      createDashboard(baseToken, dashboard);
      dashboardsCreated += 1;
      dashboards = listDashboards(baseToken);
    }
    const dashboardId = dashboards.get(dashboard.name)?.id;
    if (!dashboardId) throw new Error(`Dashboard ${dashboard.name} exists but no dashboard_id/id was returned`);
    let blocks = listDashboardBlocks(baseToken, dashboardId);
    for (const block of dashboard.blocks) {
      if (!blocks.has(block.name)) {
        createDashboardBlock(baseToken, dashboardId, block);
        blocksCreated += 1;
        blocks = listDashboardBlocks(baseToken, dashboardId);
      }
    }
    const missing = dashboard.blocks.map((block) => block.name).filter((name) => !blocks.has(name));
    if (missing.length) throw new Error(`Dashboard ${dashboard.name} missing block(s): ${missing.join(", ")}`);
  }
  return { dashboardsCreated, blocksCreated };
}

function apply(args) {
  runRaw(["--version"], "lark-cli version", { json: false });
  verifyUserAuthStatus();
  const baseToken = args.baseToken.trim();
  verifySchema(baseToken);
  const views = reconcileViews(baseToken);
  const dashboards = reconcileDashboards(baseToken);
  const finalViewCount = uxContract.tables.reduce((sum, table) => sum + table.views.length, 0);
  const finalBlockCount = uxContract.dashboards.reduce((sum, dashboard) => sum + dashboard.blocks.length, 0);
  console.log(JSON.stringify({
    ok: true,
    mode: "apply",
    contract_version: uxContract.contract_version,
    product_release: uxContract.product_release,
    base_token: baseToken,
    views: { expected: finalViewCount, ...views },
    dashboards: { expected: uxContract.dashboards.length, blocks_expected: finalBlockCount, ...dashboards },
    table_icons: {
      status: "MANUAL_UI_PASS_REQUIRED",
      assignments: uxContract.table_icons,
      reason: uxContract.table_icon_delivery.reason,
    },
    next: "Apply the three sidebar table icons in Lark UI, then visually inspect the 22 curated views and two dashboards before runtime E2E.",
  }, null, 2));
}

const args = parseArgs(process.argv.slice(2));
try {
  if (!args.apply) plan();
  else apply(args);
} catch (error) {
  console.error(JSON.stringify({ ok: false, stage: "lark_base_ux_provision", error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
}
