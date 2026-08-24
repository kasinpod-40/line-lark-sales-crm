#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { isNoOpMutationFailure, mutationDesiredForViewProperty, readbackDesiredForViewProperty, viewPropertyMatches } from "./lark-cli-idempotency.mjs";
import { resourceMapFromList } from "./lark-cli-resource-list.mjs";
import { reconcileIfNeeded, verifyEventually } from "./lark-eventual-reconcile.mjs";

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
      console.log("Usage:\n  npm run lark:base:ux:plan\n  npm run lark:base:ux:apply -- --base-token <existing_base_token>\n\nPlan mode performs zero Lark mutations. Apply mode reconciles View resources, filters/groups/sorts and dashboards only. visible_fields are intentionally delivered by the Base JS SDK UI runner because the current live server mutation path does not persist them reliably.");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.identity !== "user") throw new Error("Golden Base UX provisioning is locked to --identity user");
  if (args.apply && !args.baseToken.trim()) throw new Error("--base-token is required with --apply");
  return args;
}

function visibleFieldViewCount() {
  return uxContract.tables.reduce((sum, table) => sum + table.views.filter((view) => Array.isArray(view.visible_fields)).length, 0);
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
    visible_fields: {
      delivery: "base_js_sdk_ui",
      expected_views: visibleFieldViewCount(),
      command: "npm run lark:base:ux:visible-ui",
    },
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

function sleepMs(ms) {
  if (ms <= 0) return;
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, ms);
}

function parseJson(text, label) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error(`${label} returned empty output`);
  try { return JSON.parse(trimmed); }
  catch { throw new Error(`${label} returned non-JSON output: ${trimmed.slice(0, 800)}`); }
}

function runRaw(args, label, { json = true, requireOk = true, allowNoOp = false } = {}) {
  const result = spawnSync("lark-cli", args, { encoding: "utf8", env: cliEnv(), maxBuffer: 32 * 1024 * 1024 });
  if (result.error) {
    if (result.error.code === "ENOENT") throw new Error("lark-cli is not installed or not on PATH");
    throw result.error;
  }
  if (result.status !== 0) {
    const rawDetail = String(result.stderr || result.stdout || "").trim();
    if (allowNoOp && isNoOpMutationFailure(rawDetail)) {
      return { ok: true, no_op: true, source: "lark_cli_no_operation" };
    }
    let detail = rawDetail;
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

function runLarkMutation(args, label) {
  return runRaw([...args, "--as", "user"], label, { json: true, requireOk: true, allowNoOp: true });
}

function verifyUserAuthStatus() {
  const status = runRaw(["auth", "status", "--json", "--verify"], "Lark user auth status", { json: true, requireOk: false });
  if (status?.identity !== "user") throw new Error(`Lark user auth status is not user-ready: identity=${String(status?.identity || "none")}`);
  if (status?.verified !== true) throw new Error(`Lark user auth status is not verified${status?.verifyError ? ` | ${status.verifyError}` : ""}`);
}

function tableMap(payload) {
  return resourceMapFromList(payload, { collectionKeys: ["tables"], nameKeys: ["name", "table_name"], idKeys: ["id", "table_id"], label: "table" });
}
function fieldMap(payload) {
  return resourceMapFromList(payload, { collectionKeys: ["fields"], nameKeys: ["name", "field_name"], idKeys: ["id", "field_id"], label: "field" });
}
function viewMap(payload) {
  return resourceMapFromList(payload, { collectionKeys: ["views"], nameKeys: ["name", "view_name"], idKeys: ["id", "view_id"], label: "view" });
}
function dashboardMap(payload) {
  return resourceMapFromList(payload, { collectionKeys: ["items", "dashboards"], nameKeys: ["name", "dashboard_name"], idKeys: ["dashboard_id", "id"], label: "dashboard" });
}
function blockMap(payload) {
  return resourceMapFromList(payload, { collectionKeys: ["items", "blocks"], nameKeys: ["name", "block_name"], idKeys: ["block_id", "id"], label: "dashboard block" });
}

function listTables(baseToken) {
  return tableMap(runLark(["base", "+table-list", "--base-token", baseToken], "List Base tables"));
}
function listFields(baseToken, tableRef, label = tableRef) {
  return fieldMap(runLark(["base", "+field-list", "--base-token", baseToken, "--table-id", tableRef], `List fields ${label}`));
}
function listViews(baseToken, tableRef, label = tableRef) {
  return viewMap(runLark(["base", "+view-list", "--base-token", baseToken, "--table-id", tableRef, "--limit", "200"], `List views ${label}`));
}
function listDashboards(baseToken) {
  return dashboardMap(runLark(["base", "+dashboard-list", "--base-token", baseToken, "--page-size", "100"], "List dashboards"));
}
function listDashboardBlocks(baseToken, dashboardId) {
  return blockMap(runLark(["base", "+dashboard-block-list", "--base-token", baseToken, "--dashboard-id", dashboardId, "--page-size", "100"], `List dashboard blocks ${dashboardId}`));
}

function requireResourceId(map, name, label) {
  const meta = map.get(name);
  const id = meta?.id;
  if (typeof id !== "string" || !id.trim()) throw new Error(`${label} ${name} exists but current Lark CLI returned no concrete id`);
  return id.trim();
}

function waitForNamedResource(readMap, name, label) {
  const result = verifyEventually({
    read: readMap,
    matches: (map) => map.has(name) && Boolean(map.get(name)?.id),
    sleep: sleepMs,
  });
  if (!result.ok) throw new Error(`${label} did not become visible with a concrete id after ${result.attempts} eventual-consistency reads`);
  return result.last.get(name);
}

function waitForAbsentResource(readMap, name, label) {
  const result = verifyEventually({
    read: readMap,
    matches: (map) => !map.has(name),
    sleep: sleepMs,
  });
  if (!result.ok) throw new Error(`${label} remained visible after ${result.attempts} eventual-consistency reads`);
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

function fieldIdsByName(fields, tableName) {
  const ids = {};
  for (const name of expectedFieldNames(tableName)) {
    const meta = fields.get(name);
    if (!meta) throw new Error(`Expected field ${tableName}.${name} is missing from current Lark field list`);
    if (!meta.id) throw new Error(`Field ${tableName}.${name} exists but current Lark CLI returned no id/field_id`);
    ids[name] = meta.id;
  }
  return ids;
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
    const tableId = requireResourceId(tables, tableName, "Table");
    const actual = listFields(baseToken, tableId, tableName);
    const expected = expectedFieldNames(tableName);
    const missing = [...expected].filter((name) => !actual.has(name));
    if (missing.length) throw new Error(`UX apply requires completed schema; ${tableName} missing fields: ${missing.join(", ")}`);
  }
  return tables;
}

function createView(baseToken, tableId, tableName, view) {
  runLark(["base", "+view-create", "--base-token", baseToken, "--table-id", tableId, "--json", JSON.stringify({ name: view.name, type: view.type })], `Create view ${tableName}.${view.name}`);
  return waitForNamedResource(() => listViews(baseToken, tableId, tableName), view.name, `Created view ${tableName}.${view.name}`);
}

function renameView(baseToken, tableId, tableName, fromId, fromName, toName) {
  runLark(["base", "+view-rename", "--base-token", baseToken, "--table-id", tableId, "--view-id", fromId, "--name", toName], `Rename view ${tableName}.${fromName}`);
  return waitForNamedResource(() => listViews(baseToken, tableId, tableName), toName, `Renamed view ${tableName}.${toName}`);
}

const viewPropertyCommands = {
  filter: { get: "+view-get-filter", set: "+view-set-filter" },
  group: { get: "+view-get-group", set: "+view-set-group" },
  sort: { get: "+view-get-sort", set: "+view-set-sort" },
};

function getViewProperty(baseToken, tableId, tableName, viewId, viewName, property) {
  const command = viewPropertyCommands[property]?.get;
  if (!command) throw new Error(`Unsupported server-owned view property read: ${property}`);
  return runLark([
    "base", command,
    "--base-token", baseToken,
    "--table-id", tableId,
    "--view-id", viewId,
  ], `Read ${property} ${tableName}.${viewName}`);
}

function reconcileViewProperty(baseToken, tableId, tableName, viewId, viewName, property, desired, fieldIds) {
  const commands = viewPropertyCommands[property];
  if (!commands) throw new Error(`Unsupported server-owned view property reconcile: ${property}`);

  const readbackDesired = readbackDesiredForViewProperty(property, desired, fieldIds);
  const mutationDesired = mutationDesiredForViewProperty(property, desired, fieldIds);

  return reconcileIfNeeded({
    read: () => getViewProperty(baseToken, tableId, tableName, viewId, viewName, property),
    matches: (payload) => viewPropertyMatches(payload, readbackDesired, fieldIds),
    write: () => runLarkMutation([
      "base", commands.set,
      "--base-token", baseToken,
      "--table-id", tableId,
      "--view-id", viewId,
      "--json", JSON.stringify(mutationDesired),
    ], `Set ${property} ${tableName}.${viewName}`),
  });
}

function mergePropertyStats(target, result) {
  target.changed += result.changed;
  target.unchanged += result.unchanged;
  target.no_op_recovered += result.noOpRecovered;
}

function setViewConfig(baseToken, tableId, tableName, viewId, view, fieldIds) {
  const stats = { changed: 0, unchanged: 0, no_op_recovered: 0, visible_fields_deferred: Array.isArray(view.visible_fields) ? 1 : 0 };
  if (view.filter) mergePropertyStats(stats, reconcileViewProperty(baseToken, tableId, tableName, viewId, view.name, "filter", view.filter, fieldIds));
  if (view.group) mergePropertyStats(stats, reconcileViewProperty(baseToken, tableId, tableName, viewId, view.name, "group", view.group, fieldIds));
  if (view.sort) mergePropertyStats(stats, reconcileViewProperty(baseToken, tableId, tableName, viewId, view.name, "sort", view.sort, fieldIds));
  return stats;
}

function verifyViewPropertyEventually(baseToken, tableId, tableName, viewId, viewName, property, desired, fieldIds) {
  const result = verifyEventually({
    read: () => getViewProperty(baseToken, tableId, tableName, viewId, viewName, property),
    matches: (payload) => viewPropertyMatches(payload, desired, fieldIds),
    sleep: sleepMs,
  });
  if (!result.ok) {
    const actual = JSON.stringify(result.last).slice(0, 1200);
    const expected = JSON.stringify(desired).slice(0, 1200);
    throw new Error(`Final readback mismatch for ${property} ${tableName}.${viewName} after ${result.attempts} eventual-consistency reads; expected=${expected}; actual=${actual}`);
  }
  return result.attempts;
}

function verifyTableViewState(baseToken, tableId, tableContract, fieldIds) {
  let reads = 0;
  const liveViews = listViews(baseToken, tableId, tableContract.name);
  for (const view of tableContract.views) {
    const viewId = requireResourceId(liveViews, view.name, `View ${tableContract.name}`);
    if (view.filter) reads += verifyViewPropertyEventually(baseToken, tableId, tableContract.name, viewId, view.name, "filter", view.filter, fieldIds);
    if (view.group) reads += verifyViewPropertyEventually(baseToken, tableId, tableContract.name, viewId, view.name, "group", readbackDesiredForViewProperty("group", view.group, fieldIds), fieldIds);
    if (view.sort) reads += verifyViewPropertyEventually(baseToken, tableId, tableContract.name, viewId, view.name, "sort", readbackDesiredForViewProperty("sort", view.sort, fieldIds), fieldIds);
  }
  return reads;
}

function deleteView(baseToken, tableId, tableName, viewId, viewName) {
  runLark(["base", "+view-delete", "--base-token", baseToken, "--table-id", tableId, "--view-id", viewId, "--yes"], `Delete extra view ${tableName}.${viewName}`);
  waitForAbsentResource(() => listViews(baseToken, tableId, tableName), viewName, `Deleted extra view ${tableName}.${viewName}`);
}

function reconcileViews(baseToken, tables) {
  let created = 0;
  let renamed = 0;
  let deleted = 0;
  let verificationReads = 0;
  const properties = { changed: 0, unchanged: 0, no_op_recovered: 0, visible_fields_deferred: 0 };

  for (const tableContract of uxContract.tables) {
    const tableId = requireResourceId(tables, tableContract.name, "Table");
    const fieldIds = fieldIdsByName(listFields(baseToken, tableId, tableContract.name), tableContract.name);
    let existing = listViews(baseToken, tableId, tableContract.name);
    const desiredNames = new Set(tableContract.views.map((view) => view.name));
    const first = tableContract.views[0];

    if (!existing.has(first.name)) {
      const reusable = [...existing.entries()].find(([name]) => !desiredNames.has(name));
      if (reusable) {
        const reusableId = requireResourceId(existing, reusable[0], `View ${tableContract.name}`);
        renameView(baseToken, tableId, tableContract.name, reusableId, reusable[0], first.name);
        renamed += 1;
        existing = listViews(baseToken, tableId, tableContract.name);
      }
    }

    for (const view of tableContract.views) {
      let meta = existing.get(view.name);
      if (!meta) {
        meta = createView(baseToken, tableId, tableContract.name, view);
        created += 1;
        existing.set(view.name, meta);
      }
      const viewId = requireResourceId(existing, view.name, `View ${tableContract.name}`);
      const result = setViewConfig(baseToken, tableId, tableContract.name, viewId, view, fieldIds);
      properties.changed += result.changed;
      properties.unchanged += result.unchanged;
      properties.no_op_recovered += result.no_op_recovered;
      properties.visible_fields_deferred += result.visible_fields_deferred;
    }

    if (uxContract.prune_extra_views === true) {
      existing = listViews(baseToken, tableId, tableContract.name);
      for (const [name] of existing.entries()) {
        if (!desiredNames.has(name)) {
          const viewId = requireResourceId(existing, name, `View ${tableContract.name}`);
          deleteView(baseToken, tableId, tableContract.name, viewId, name);
          deleted += 1;
        }
      }
    }

    const namesResult = verifyEventually({
      read: () => listViews(baseToken, tableId, tableContract.name),
      matches: (map) => tableContract.views.every((view) => map.has(view.name) && Boolean(map.get(view.name)?.id)) && (uxContract.prune_extra_views !== true || [...map.keys()].every((name) => desiredNames.has(name))),
      sleep: sleepMs,
    });
    if (!namesResult.ok) {
      const finalViews = namesResult.last || new Map();
      const missing = tableContract.views.map((view) => view.name).filter((name) => !finalViews.has(name));
      const extras = [...finalViews.keys()].filter((name) => !desiredNames.has(name));
      throw new Error(`View reconciliation failed for ${tableContract.name}; missing=[${missing.join(", ")}], extras=[${extras.join(", ")}]`);
    }

    verificationReads += verifyTableViewState(baseToken, tableId, tableContract, fieldIds);
  }

  return { created, renamed, deleted, properties, verification_reads: verificationReads };
}

function createDashboard(baseToken, dashboard) {
  runLark(["base", "+dashboard-create", "--base-token", baseToken, "--name", dashboard.name], `Create dashboard ${dashboard.name}`);
  return waitForNamedResource(() => listDashboards(baseToken), dashboard.name, `Created dashboard ${dashboard.name}`);
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
  return waitForNamedResource(() => listDashboardBlocks(baseToken, dashboardId), block.name, `Created dashboard block ${block.name}`);
}

function reconcileDashboards(baseToken) {
  let dashboardsCreated = 0;
  let blocksCreated = 0;
  let dashboards = listDashboards(baseToken);

  for (const dashboard of uxContract.dashboards) {
    let dashboardMeta = dashboards.get(dashboard.name);
    if (!dashboardMeta) {
      dashboardMeta = createDashboard(baseToken, dashboard);
      dashboardsCreated += 1;
      dashboards.set(dashboard.name, dashboardMeta);
    }
    const dashboardId = requireResourceId(dashboards, dashboard.name, "Dashboard");

    let blocks = listDashboardBlocks(baseToken, dashboardId);
    for (const block of dashboard.blocks) {
      if (!blocks.has(block.name)) {
        const meta = createDashboardBlock(baseToken, dashboardId, block);
        blocksCreated += 1;
        blocks.set(block.name, meta);
      }
    }

    const blockNames = new Set(dashboard.blocks.map((block) => block.name));
    const finalBlocks = verifyEventually({
      read: () => listDashboardBlocks(baseToken, dashboardId),
      matches: (map) => [...blockNames].every((name) => map.has(name) && Boolean(map.get(name)?.id)),
      sleep: sleepMs,
    });
    if (!finalBlocks.ok) {
      const missing = [...blockNames].filter((name) => !finalBlocks.last?.has(name));
      throw new Error(`Dashboard ${dashboard.name} missing block(s) after eventual-consistency verification: ${missing.join(", ")}`);
    }
  }

  return { dashboardsCreated, blocksCreated };
}

function apply(args) {
  runRaw(["--version"], "lark-cli version", { json: false });
  verifyUserAuthStatus();
  const baseToken = args.baseToken.trim();
  const tables = verifySchema(baseToken);
  const views = reconcileViews(baseToken, tables);
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
    visible_fields: {
      status: "BASE_JS_SDK_UI_REQUIRED",
      expected_views: visibleFieldViewCount(),
      server_mutation_count: 0,
      command: "npm run lark:base:ux:visible-ui",
      reason: "Live golden Base proved +view-set-visible-fields may return without persisting the requested subset; visible field membership/order is therefore owned by the in-Base JS SDK runner.",
    },
    dashboards: { expected: uxContract.dashboards.length, blocks_expected: finalBlockCount, ...dashboards },
    table_icons: {
      status: "MANUAL_UI_PASS_REQUIRED",
      assignments: uxContract.table_icons,
      reason: uxContract.table_icon_delivery.reason,
    },
    next: "Run npm run lark:base:ux:visible-ui and apply visible fields inside this Base. After that returns ok=true, apply the three sidebar table icons and visually inspect the 22 curated views and two dashboards before runtime E2E.",
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
