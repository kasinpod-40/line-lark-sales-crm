const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'deploy/lark-base-contract.json'), 'utf8'));

function table(name) {
  const value = contract.tables.find((item) => item.name === name);
  assert.ok(value, `missing table ${name}`);
  return value;
}

function allFieldNames(value) {
  return new Set([
    ...value.fields.map((field) => field.name),
    ...(value.deferred_fields || []).map((field) => field.name),
    ...(value.generated_backlinks || []),
  ]);
}

test('Lark Base contract is exactly the reusable three-table snake_case model', () => {
  assert.equal(contract.contract_version, 'lark_base_golden_contract_v1');
  assert.equal(contract.product_release, '0.3.0');
  assert.equal(contract.time_zone, 'Asia/Bangkok');
  assert.deepEqual(contract.tables.map((item) => item.name), ['Customers', 'Chat_Tracking', 'Sales_Deals']);

  const expectedPrimary = {
    Customers: 'customer_id',
    Chat_Tracking: 'tracking_id',
    Sales_Deals: 'deal_id',
  };
  for (const item of contract.tables) {
    assert.equal(item.primary_field, expectedPrimary[item.name]);
    assert.equal(item.fields[0].name, item.primary_field, `${item.name} primary field must be first for Lark table create`);
    for (const field of [...item.fields, ...(item.deferred_fields || [])]) {
      assert.match(field.name, /^[a-z][a-z0-9_]*$/, `${item.name}.${field.name} must be lower snake_case`);
    }
  }
});

test('contract contains every field written/read by the CRM repositories and SRS reporting model', () => {
  const required = {
    Customers: [
      'customer_id', 'line_user_id', 'display_name', 'picture_url', 'customer_stage', 'vip_status',
      'total_spend_thb', 'assigned_sales_id', 'assigned_sales_name', 'ai_intent', 'ai_intent_label',
      'buyer_intent', 'lead_quality', 'lead_score', 'hot_lead', 'ai_summary', 'ai_guidance',
      'last_message_at', 'created_at', 'updated_at', 'chat_history', 'deals',
    ],
    Chat_Tracking: [
      'tracking_id', 'record_type', 'case_id', 'customer', 'customer_id', 'customer_msg_time',
      'sales_reply_time', 'assigned_sales', 'assigned_sales_id', 'ai_intent', 'lead_quality', 'channel',
      'sla_minutes', 'sla_status', 'direction', 'message_type', 'message_id', 'message_text', 'event_at',
      'lark_root_message_id', 'lark_thread_id', 'case_status', 'opened_at', 'claimed_at', 'claim_seconds',
      'first_response_at', 'first_response_seconds', 'closed_at', 'resolution_seconds', 'updated_at',
    ],
    Sales_Deals: [
      'deal_id', 'case_id', 'customer', 'customer_id', 'deal_value_thb', 'sales_id', 'sales_rep',
      'deal_status', 'pipeline_stage', 'closed_won_value_thb', 'quotation_no', 'quotation_status',
      'quotation_items_json', 'subtotal', 'discount', 'vat_rate', 'vat_amount', 'shipping_fee',
      'total_amount', 'quotation_note', 'quotation_valid_until', 'quotation_sent_at', 'payment_amount',
      'payment_status', 'qr_sent_at', 'closed_at', 'created_at', 'updated_at',
    ],
  };

  for (const [tableName, fields] of Object.entries(required)) {
    const actual = allFieldNames(table(tableName));
    for (const field of fields) assert.ok(actual.has(field), `missing ${tableName}.${field}`);
  }
});

test('customer links create the two required backlinks and monetary fields use THB', () => {
  const chatCustomer = table('Chat_Tracking').fields.find((field) => field.name === 'customer');
  const dealCustomer = table('Sales_Deals').fields.find((field) => field.name === 'customer');
  assert.deepEqual(
    { type: chatCustomer.type, link_table: chatCustomer.link_table, bidirectional: chatCustomer.bidirectional, back: chatCustomer.bidirectional_link_field_name },
    { type: 'link', link_table: 'Customers', bidirectional: true, back: 'chat_history' },
  );
  assert.deepEqual(
    { type: dealCustomer.type, link_table: dealCustomer.link_table, bidirectional: dealCustomer.bidirectional, back: dealCustomer.bidirectional_link_field_name },
    { type: 'link', link_table: 'Customers', bidirectional: true, back: 'deals' },
  );

  const money = table('Sales_Deals').fields.filter((field) => field.style?.type === 'currency');
  assert.ok(money.length >= 7);
  for (const field of money) {
    assert.equal(field.style.currency_code, 'THB', `${field.name} must use THB`);
    assert.equal(field.style.precision, 2, `${field.name} must use 2 decimal precision`);
  }
});

test('formula dependency order is explicit and uses current Lark formula syntax', () => {
  assert.deepEqual(contract.deferred_field_order, [
    'Chat_Tracking.sla_minutes',
    'Chat_Tracking.sla_status',
    'Sales_Deals.closed_won_value_thb',
    'Customers.total_spend_thb',
  ]);
  const expressions = contract.tables.flatMap((item) => item.deferred_fields || []).map((field) => field.expression);
  assert.ok(expressions.some((value) => value.includes('DAYS([sales_reply_time], [customer_msg_time])')));
  assert.ok(expressions.some((value) => value.includes('[deal_status] = "Closed Won 🏆"')));
  assert.ok(expressions.some((value) => value.includes('[Sales_Deals].FILTER(') && value.includes('.SUM()')));
  assert.ok(expressions.every((value) => !value.includes('==')));
});

test('contract contains no deployment credentials or concrete Lark resource IDs', () => {
  const raw = JSON.stringify(contract);
  assert.doesNotMatch(raw, /app_secret|access_token|channel_secret|verification_token|encrypt_key/i);
  assert.doesNotMatch(raw, /\b(?:cli_|bascn_|tbl|oc_)[A-Za-z0-9_-]{6,}/);
});

test('provisioner defaults to zero-mutation plan mode', () => {
  const output = execFileSync(process.execPath, [path.join(root, 'scripts/provision-lark-base.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
  const result = JSON.parse(output);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'plan');
  assert.equal(result.mutation_count, 0);
  assert.deepEqual(result.operations.at(-2).tables, ['Customers', 'Chat_Tracking', 'Sales_Deals']);
});
