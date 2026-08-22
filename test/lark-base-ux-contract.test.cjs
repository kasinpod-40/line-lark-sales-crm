const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'deploy/lark-base-contract.json'), 'utf8'));
const ux = JSON.parse(fs.readFileSync(path.join(root, 'deploy/lark-base-ux-contract.json'), 'utf8'));
const provisioner = path.join(root, 'scripts/provision-lark-base-ux.mjs');

function schemaFields(tableName) {
  const table = schema.tables.find((item) => item.name === tableName);
  assert.ok(table, `missing schema table ${tableName}`);
  return new Set([
    ...table.fields.map((field) => field.name),
    ...(table.deferred_fields || []).map((field) => field.name),
    ...(table.generated_backlinks || []),
  ]);
}

function filterTupleFields(filter) {
  return (filter?.conditions || []).map((condition) => condition[0]);
}

function dashboardFilterFields(filter) {
  return (filter?.conditions || []).map((condition) => condition.field_name);
}

test('golden UX contract is substantially richer than the thin demo presentation', () => {
  assert.equal(ux.contract_version, 'lark_base_golden_ux_v1');
  assert.equal(ux.product_release, schema.product_release);
  assert.equal(ux.base_contract_version, schema.contract_version);
  assert.equal(ux.prune_extra_views, true);
  assert.deepEqual(ux.table_icons, { Customers: '👥', Chat_Tracking: '💬', Sales_Deals: '💰' });
  assert.equal(ux.table_icon_delivery.mode, 'manual_ui_pass');

  const viewCount = ux.tables.reduce((sum, table) => sum + table.views.length, 0);
  const blockCount = ux.dashboards.reduce((sum, dashboard) => sum + dashboard.blocks.length, 0);
  assert.equal(viewCount, 22);
  assert.equal(ux.dashboards.length, 2);
  assert.equal(blockCount, 23);
  assert.ok(viewCount > 12, 'golden UX must expose more curated views than the supplied demo');
  assert.ok(blockCount > 7, 'golden UX must expose more dashboard blocks than the supplied demo');
});

test('every curated view has an intentional emoji title and references real schema fields', () => {
  assert.deepEqual(ux.tables.map((table) => table.name), ['Customers', 'Chat_Tracking', 'Sales_Deals']);
  const allowedTypes = new Set(['grid', 'kanban', 'gallery', 'calendar', 'gantt']);
  for (const table of ux.tables) {
    const fields = schemaFields(table.name);
    const names = new Set();
    for (const view of table.views) {
      assert.match(view.name, /^\p{Extended_Pictographic}/u, `${table.name}.${view.name} must start with an icon`);
      assert.ok(!names.has(view.name), `duplicate view ${table.name}.${view.name}`);
      names.add(view.name);
      assert.ok(allowedTypes.has(view.type), `unsupported view type ${view.type}`);
      for (const field of view.visible_fields || []) assert.ok(fields.has(field), `${table.name}.${view.name} visible field ${field} missing`);
      for (const field of filterTupleFields(view.filter)) assert.ok(fields.has(field), `${table.name}.${view.name} filter field ${field} missing`);
      for (const item of view.group?.group_config || []) assert.ok(fields.has(item.field), `${table.name}.${view.name} group field ${item.field} missing`);
      for (const item of view.sort?.sort_config || []) assert.ok(fields.has(item.field), `${table.name}.${view.name} sort field ${item.field} missing`);
    }
  }
});

test('dashboard blocks are icon-led, use valid schema fields, and cover executive plus operations reporting', () => {
  const dashboardNames = ux.dashboards.map((dashboard) => dashboard.name);
  assert.deepEqual(dashboardNames, ['🚀 Executive CRM Command Center', '⚡ Sales Ops & SLA Control Room']);
  const allowedTypes = new Set(['column', 'bar', 'line', 'pie', 'ring', 'area', 'combo', 'scatter', 'funnel', 'wordCloud', 'radar', 'statistics', 'text']);
  for (const dashboard of ux.dashboards) {
    assert.match(dashboard.name, /^\p{Extended_Pictographic}/u);
    const blockNames = new Set();
    for (const block of dashboard.blocks) {
      assert.match(block.name, /^\p{Extended_Pictographic}/u, `${dashboard.name}.${block.name} must start with an icon`);
      assert.ok(!blockNames.has(block.name), `duplicate block ${block.name}`);
      blockNames.add(block.name);
      assert.ok(allowedTypes.has(block.type), `unsupported block type ${block.type}`);
      assert.deepEqual(Object.keys(block.position).sort(), ['h', 'w', 'x', 'y']);
      assert.ok(block.position.w >= 1 && block.position.w <= 12);
      assert.ok(block.position.x >= 0 && block.position.x + block.position.w <= 12);
      assert.ok(block.position.y >= 0 && block.position.h >= 1);
      if (block.type === 'text') {
        assert.equal(typeof block.data_config.text, 'string');
        assert.ok(block.data_config.text.length > 10);
        continue;
      }
      const tableName = block.data_config.table_name;
      const fields = schemaFields(tableName);
      assert.notEqual(Boolean(block.data_config.series), Boolean(block.data_config.count_all), `${block.name} must use exactly one metric source`);
      for (const series of block.data_config.series || []) {
        assert.ok(fields.has(series.field_name), `${block.name} series field ${series.field_name} missing`);
        assert.ok(['SUM', 'MAX', 'MIN', 'AVERAGE'].includes(series.rollup));
      }
      for (const group of block.data_config.group_by || []) assert.ok(fields.has(group.field_name), `${block.name} group field ${group.field_name} missing`);
      for (const field of dashboardFilterFields(block.data_config.filter)) assert.ok(fields.has(field), `${block.name} filter field ${field} missing`);
    }
  }
});

test('UX contract contains no concrete Lark deployment IDs or credentials', () => {
  const raw = JSON.stringify(ux);
  assert.doesNotMatch(raw, /app_secret|access_token|verification_token|encrypt_key/i);
  assert.doesNotMatch(raw, /\b(?:cli_|bascn_|tbl|oc_)[A-Za-z0-9_-]{6,}/);
});

test('UX provisioner defaults to zero-mutation plan mode', () => {
  const output = execFileSync(process.execPath, [provisioner], { cwd: root, encoding: 'utf8' });
  const result = JSON.parse(output);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'plan');
  assert.equal(result.mutation_count, 0);
  assert.equal(result.view_count, 22);
  assert.equal(result.dashboard_count, 2);
  assert.equal(result.dashboard_block_count, 23);
  assert.equal(result.table_icon_delivery.mode, 'manual_ui_pass');
});
