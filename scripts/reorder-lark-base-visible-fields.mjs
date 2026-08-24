#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { resourceMapFromList, resolveCanonicalNamedResource } from "./lark-cli-resource-list.mjs";
import { isNoOpMutationFailure } from "./lark-cli-idempotency.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaContract = JSON.parse(readFileSync(resolve(__dirname, "../deploy/lark-base-contract.json"), "utf8"));
const uxContract = JSON.parse(readFileSync(resolve(__dirname, "../deploy/lark-base-ux-contract.json"), "utf8"));

const WRITE_GATE = "VIEW_ORDER_ONLY";
const SUPPORTED_VIEW_TYPES = new Set(["grid", "kanban", "gallery", "calendar", "gantt"]);

function parseArgs(argv) {
  const args = { apply: false, baseToken: "", identity: "user", enableWrite: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--base-token") args.baseToken = argv[++i] || "";
    else if (arg === "--identity") args.identity = argv[++i] || "";
    else if (arg === "--enable-view-order-write") args.enableWrite = argv[++i] || "";
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:\n  node scripts/reorder-lark-base-visible-fields.mjs --base-token <token>\n  node scripts/reorder-lark-base-visible-fields.mjs --apply --enable-view-order-write ${WRITE_GATE} --base-token <token>\n\nDefault mode is live read-only planning. Apply mutates visible_fields/order only, verifies exact readback for every View, uses a primary-only staged rebuild only when direct reorder does not persist, and rolls back the original visible_fields if staged rebuild fails.`);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.identity !== "user") throw new Error("View ordering is locked to --identity user");
  if (!args.baseToken.trim()) throw new Error("--base-token is required");
  if (args.apply && args.enableWrite !== WRITE_GATE) {
    throw new Error(`Apply is disabled by default. Re-run with --enable-view-order-write ${WRITE_GATE}`);
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

function parseJson(text, label) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error(`${label} returned empty output`);
  try { return JSON.parse(trimmed); }
  catch { throw new Error(`${label} returned non-JSON output: ${trimmed.slice(0, 1200)}`); }
}

function runRaw(args, label, { requireOk = true, allowNoOp = false } = {}) {
  const result = spawnSync("lark-cli", args, {
    encoding: "utf8",
    env: cliEnv(),
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    if (result.error.code === "ENOENT") throw new Error("lark-cli is not installed or not on PATH");
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    if (allowNoOp && (isNoOpMutationFailure(detail) || /800070003|no operation produced/i.test(detail))) {
      return { ok: true, no_op: true, raw_error: detail.slice(0, 1200) };
    }
    throw new Error(`${label} failed (exit ${result.status}): ${detail.slice(0, 2400)}`);
  }
  const parsed = parseJson(result.stdout, label);
  if (requireOk && parsed?.ok !== true) throw new Error(`${label} returned JSON without ok=true`);
  return parsed;
}

function runLark(args, label) {
  return runRaw([...args, "--as", "user"], label);
}

function runLarkMutation(args, label) {
  return runRaw([...args, "--as", "user"], label, { allowNoOp: true });
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

function listViews(baseToken, tableId, label) {
  return mapResources(
    runLark(["base", "+view-list", "--base-token", baseToken, "--table-id", tableId, "--limit", "200"], `List views ${label}`),
    ["views"], ["name", "view_name"], ["id", "view_id"], "view",
  );
}

function reverseFieldIds(fields) {
  const byId = new Map();
  for (const [name, meta] of fields.entries()) {
    if (meta?.id) byId.set(String(meta.id), name);
  }
  return byId;
}

function findVisibleFieldArray(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    const tokens = value.map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        for (const key of ["field_name", "name", "field_id", "id"]) {
          if (typeof item[key] === "string" && item[key].trim()) return item[key].trim();
        }
      }
      return "";
    }).filter(Boolean);
    if (tokens.length === value.length) return tokens;
    for (const item of value) {
      const nested = findVisibleFieldArray(item, seen);
      if (nested) return nested;
    }
    return null;
  }
  if (Array.isArray(value.visible_fields)) return findVisibleFieldArray(value.visible_fields, seen);
  for (const nested of Object.values(value)) {
    const found = findVisibleFieldArray(nested, seen);
    if (found) return found;
  }
  return null;
}

function canonicalVisibleNames(payload, fields, label) {
  const raw = findVisibleFieldArray(payload);
  if (!raw) throw new Error(`${label} did not contain a readable visible_fields array`);
  const idToName = reverseFieldIds(fields);
  const names = raw.map((token) => fields.has(token) ? token : idToName.get(token) || token);
  if (new Set(names).size !== names.length) throw new Error(`${label} returned duplicate visible_fields after canonicalization`);
  return names;
}

function getVisibleFields(baseToken, tableId, viewId, fields, label) {
  const payload = runLark([
    "base", "+view-get-visible-fields",
    "--base-token", baseToken,
    "--table-id", tableId,
    "--view-id", viewId,
  ], `Read visible_fields ${label}`);
  return canonicalVisibleNames(payload, fields, `Read visible_fields ${label}`);
}

function setVisibleFields(baseToken, tableId, viewId, names, label) {
  return runLarkMutation([
    "base", "+view-set-visible-fields",
    "--base-token", baseToken,
    "--table-id", tableId,
    "--view-id", viewId,
    "--json", JSON.stringify({ visible_fields: names }),
  ], `Set visible_fields ${label}`);
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

const FIELD_PRIORITY = new Map([
  ["display_name", 100], ["customer", 110], ["assigned_sales_name", 120], ["assigned_sales", 121], ["sales_rep", 122], ["quotation_no", 130], ["message_text", 140],
  ["channel", 200], ["direction", 210], ["record_type", 220], ["message_type", 230], ["ai_intent_label", 240], ["ai_intent", 250], ["buyer_intent", 260],
  ["customer_msg_time", 300], ["sales_reply_time", 310], ["opened_at", 320], ["claimed_at", 330], ["first_response_at", 340], ["event_at", 350], ["quotation_valid_until", 360], ["quotation_sent_at", 370], ["qr_sent_at", 380], ["closed_at", 390],
  ["customer_stage", 400], ["pipeline_stage", 410], ["deal_status", 420], ["quotation_status", 430], ["payment_status", 440], ["case_status", 450], ["sla_status", 460], ["lead_quality", 470], ["vip_status", 480], ["hot_lead", 490],
  ["lead_score", 500], ["total_spend_thb", 510], ["deal_value_thb", 520], ["closed_won_value_thb", 530], ["subtotal", 540], ["discount", 550], ["vat_rate", 560], ["vat_amount", 570], ["shipping_fee", 580], ["total_amount", 590], ["payment_amount", 600], ["claim_seconds", 610], ["first_response_seconds", 620], ["sla_minutes", 630], ["resolution_seconds", 640],
  ["picture_url", 700],
  ["ai_summary", 800], ["ai_guidance", 810], ["quotation_note", 820], ["quotation_items_json", 830],
  ["case_id", 900], ["customer_id", 910], ["line_user_id", 920], ["assigned_sales_id", 930], ["sales_id", 940], ["message_id", 950],
  ["lark_root_message_id", 1000], ["lark_thread_id", 1010], ["created_at", 1020], ["updated_at", 1030],
]);

function fallbackPriority(name) {
  if (/^(sync_|checksum$)|(_checksum$)|(_hash$)/i.test(name)) return 1100;
  if (/(_url|_link|url)$/i.test(name)) return 700;
  if (/(_summary|_guidance|_note|_json|description|detail)/i.test(name)) return 840;
  if (/(_id|^id$)/i.test(name)) return 960;
  if (/(_at|_time|_date|_until)$/i.test(name)) return 395;
  if (/(status|stage|quality|vip|intent)/i.test(name)) return 495;
  if (/(amount|total|spend|revenue|value|score|seconds|minutes|click|impression|conversion)/i.test(name)) return 650;
  return 850;
}

function desiredOrder(current, primaryField) {
  const originalIndex = new Map(current.map((name, index) => [name, index]));
  return [...current].sort((left, right) => {
    const lp = left === primaryField ? 0 : FIELD_PRIORITY.get(left) ?? fallbackPriority(left);
    const rp = right === primaryField ? 0 : FIELD_PRIORITY.get(right) ?? fallbackPriority(right);
    if (lp !== rp) return lp - rp;
    return (originalIndex.get(left) ?? 0) - (originalIndex.get(right) ?? 0);
  });
}

function tableSchema(name) {
  const table = schemaContract.tables.find((item) => item.name === name);
  if (!table) throw new Error(`Schema contract missing table ${name}`);
  return table;
}

function livePlan(baseToken) {
  verifyUserAuthStatus();
  const tables = listTables(baseToken);
  const plan = [];
  for (const tableContract of uxContract.tables) {
    const liveTable = resolveCanonicalNamedResource(tables, tableContract.name, "table");
    const schema = tableSchema(tableContract.name);
    const fields = listFields(baseToken, liveTable.id, liveTable.displayName);
    const views = listViews(baseToken, liveTable.id, liveTable.displayName);

    for (const viewContract of tableContract.views) {
      if (!SUPPORTED_VIEW_TYPES.has(viewContract.type)) continue;
      const viewMeta = views.get(viewContract.name);
      if (!viewMeta?.id) throw new Error(`View ${liveTable.displayName}.${viewContract.name} is missing or has no concrete id`);
      const current = getVisibleFields(baseToken, liveTable.id, viewMeta.id, fields, `${liveTable.displayName}.${viewContract.name}`);
      const desired = desiredOrder(current, schema.primary_field);
      plan.push({
        table: liveTable.displayName,
        table_id: liveTable.id,
        canonical_table: tableContract.name,
        view: viewContract.name,
        view_id: viewMeta.id,
        view_type: viewContract.type,
        primary_field: schema.primary_field,
        current,
        desired,
        changed: !arraysEqual(current, desired),
      });
    }
  }
  return plan;
}

function applyView(baseToken, item, fields) {
  const label = `${item.table}.${item.view}`;
  const original = [...item.current];
  const desired = [...item.desired];
  if (arraysEqual(original, desired)) {
    return { ...item, status: "UNCHANGED", direct_no_op: false, staged_rebuild: false, rollback: false };
  }

  const directResult = setVisibleFields(baseToken, item.table_id, item.view_id, desired, label);
  let readback = getVisibleFields(baseToken, item.table_id, item.view_id, fields, label);
  if (arraysEqual(readback, desired)) {
    return { ...item, status: "UPDATED_DIRECT", direct_no_op: directResult?.no_op === true, staged_rebuild: false, rollback: false, readback };
  }

  if (!original.includes(item.primary_field)) {
    const rollbackResult = setVisibleFields(baseToken, item.table_id, item.view_id, original, `${label} rollback`);
    const restored = getVisibleFields(baseToken, item.table_id, item.view_id, fields, `${label} rollback`);
    if (!arraysEqual(restored, original)) throw new Error(`${label}: direct reorder failed and rollback did not restore original visible_fields`);
    return { ...item, status: "FAILED_RESTORED", direct_no_op: directResult?.no_op === true, staged_rebuild: false, rollback: true, rollback_no_op: rollbackResult?.no_op === true, readback: restored, error: "Primary field was not present in original visible_fields, so staged rebuild was not safe" };
  }

  try {
    setVisibleFields(baseToken, item.table_id, item.view_id, [item.primary_field], `${label} staged-primary`);
    const primaryReadback = getVisibleFields(baseToken, item.table_id, item.view_id, fields, `${label} staged-primary`);
    if (!arraysEqual(primaryReadback, [item.primary_field])) throw new Error(`primary-only readback mismatch: ${JSON.stringify(primaryReadback)}`);

    setVisibleFields(baseToken, item.table_id, item.view_id, desired, `${label} staged-desired`);
    readback = getVisibleFields(baseToken, item.table_id, item.view_id, fields, `${label} staged-desired`);
    if (arraysEqual(readback, desired)) {
      return { ...item, status: "UPDATED_STAGED", direct_no_op: directResult?.no_op === true, staged_rebuild: true, rollback: false, readback };
    }
    throw new Error(`desired readback mismatch: ${JSON.stringify(readback)}`);
  } catch (error) {
    const rollbackResult = setVisibleFields(baseToken, item.table_id, item.view_id, original, `${label} rollback`);
    const restored = getVisibleFields(baseToken, item.table_id, item.view_id, fields, `${label} rollback`);
    if (!arraysEqual(restored, original)) {
      throw new Error(`${label}: staged reorder failed (${error instanceof Error ? error.message : String(error)}) and rollback readback also failed; restored=${JSON.stringify(restored)} expected=${JSON.stringify(original)}`);
    }
    return {
      ...item,
      status: "FAILED_RESTORED",
      direct_no_op: directResult?.no_op === true,
      staged_rebuild: true,
      rollback: true,
      rollback_no_op: rollbackResult?.no_op === true,
      readback: restored,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function apply(baseToken, plan) {
  const tableFieldCache = new Map();
  const results = [];
  for (const item of plan) {
    let fields = tableFieldCache.get(item.table_id);
    if (!fields) {
      fields = listFields(baseToken, item.table_id, item.table);
      tableFieldCache.set(item.table_id, fields);
    }
    results.push(applyView(baseToken, item, fields));
  }
  return results;
}

const args = parseArgs(process.argv.slice(2));
try {
  const baseToken = args.baseToken.trim();
  const plan = livePlan(baseToken);
  const changed = plan.filter((item) => item.changed).length;

  if (!args.apply) {
    console.log(JSON.stringify({
      ok: true,
      mode: "plan",
      mutation_count: 0,
      base_token: baseToken,
      scope: "visible_fields membership/order only for the 22 curated Views; current visible membership is preserved exactly",
      ordering: "primary/stable key -> readable customer/sales/text -> context -> business dates -> status/stage -> business metrics -> links -> details -> external IDs -> technical/audit",
      view_count: plan.length,
      views_changed: changed,
      views_unchanged: plan.length - changed,
      write_gate_required: WRITE_GATE,
      views: plan,
    }, null, 2));
  } else {
    const results = apply(baseToken, plan);
    const failed = results.filter((item) => item.status === "FAILED_RESTORED");
    console.log(JSON.stringify({
      ok: failed.length === 0,
      mode: "apply",
      base_token: baseToken,
      view_count: results.length,
      updated_direct: results.filter((item) => item.status === "UPDATED_DIRECT").length,
      updated_staged: results.filter((item) => item.status === "UPDATED_STAGED").length,
      unchanged: results.filter((item) => item.status === "UNCHANGED").length,
      failed_restored: failed.length,
      exact_readback_verified: results.every((item) => item.status === "UNCHANGED" || arraysEqual(item.readback ?? item.current, item.status === "FAILED_RESTORED" ? item.current : item.desired)),
      no_record_mutation: true,
      no_field_schema_mutation: true,
      no_filter_mutation: true,
      no_view_name_mutation: true,
      no_view_create_delete: true,
      write_gate_closed_after_process_exit: true,
      results,
    }, null, 2));
    if (failed.length) process.exitCode = 2;
  }
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    stage: "lark_base_visible_field_order",
    write_gate_closed_after_process_exit: true,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
}
