const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const contract = JSON.parse(read('deploy/lark-base-contract.json'));

function field(tableName, fieldName) {
  const table = contract.tables.find((item) => item.name === tableName);
  assert.ok(table, `missing table ${tableName}`);
  const value = table.fields.find((item) => item.name === fieldName);
  assert.ok(value, `missing field ${tableName}.${fieldName}`);
  return value;
}

test('canonical Base contract models payment pending explicitly and has no blank lifecycle option', () => {
  const customerStages = field('Customers', 'customer_stage').options.map((item) => item.name);
  assert.deepEqual(customerStages, [
    '🌱 New Lead',
    '💬 Contacted',
    '📄 Quotation Sent',
    '💳 Payment Pending',
    '🏆 Active Customer',
    '💤 Inactive',
  ]);
  assert.ok(customerStages.every((name) => name.trim().length > 0));

  const pipeline = field('Sales_Deals', 'pipeline_stage').options.map((item) => item.name);
  assert.deepEqual(pipeline, ['Lead', 'Quotation', 'Payment Pending', 'Payment Received', 'Closed Won']);
  assert.ok(pipeline.every((name) => name.trim().length > 0));
});

test('QR confirmation embeds one PNG inside Flex and validates the asset before advancing state', () => {
  const source = read('src/services/payment-card-action.service.ts');
  assert.match(source, /paymentQrFlex/);
  assert.doesNotMatch(source, /LineImageMessage/);
  assert.doesNotMatch(source, /\[paymentFlex\(/);
  assert.match(source, /handleQrAsset/);

  const preflight = source.indexOf('await this.preflightQrAsset(qrUrl, token)');
  const pending = source.indexOf('"Pending QR Send"', preflight);
  const push = source.indexOf('await pushLineMessages(', preflight);
  const sent = source.indexOf('"QR Sent"', push);
  assert.ok(preflight >= 0, 'QR preflight must exist');
  assert.ok(pending > preflight, 'Pending state must follow PNG preflight');
  assert.ok(push > pending, 'LINE push must follow Pending state');
  assert.ok(sent > push, 'QR Sent must only be written after LINE push succeeds');
  assert.match(source, /\[paymentQrFlex\(/);
});

test('QR public asset supports LINE-friendly GET and HEAD metadata', () => {
  const source = read('src/routes/assets/qr.route.ts');
  assert.match(source, /request\.method !== "GET" && request\.method !== "HEAD"/);
  assert.match(source, /"content-type": "image\/png"/);
  assert.match(source, /"content-length": String\(png\.byteLength\)/);
  assert.match(source, /"x-content-type-options": "nosniff"/);
  assert.match(source, /request\.method === "HEAD"/);
});

test('commercial lifecycle floors Quote and Payment and prevents inbound demotion', () => {
  const lifecycle = read('src/services/commercial-lifecycle.service.ts');
  assert.match(lifecycle, /PAYMENT: "💳 Payment Pending"/);
  assert.match(lifecycle, /qualityFloor: LEAD_QUALITY\.HIGH/);
  assert.match(lifecycle, /qualityFloor: LEAD_QUALITY\.HOT/);
  assert.match(lifecycle, /pipelineStage: "Payment Pending"/);
  assert.match(lifecycle, /higherValue\(currentStage, target\.customerStage, stageRank\)/);
  assert.match(lifecycle, /lead_quality: desiredQuality/);

  const queue = read('src/queues/line-event.consumer.ts');
  const processAt = queue.indexOf('await cases.processLineEvent(body)');
  const reconcileAt = queue.indexOf('await lifecycle.reconcileByLineUserId(body.user_id)');
  assert.ok(processAt >= 0 && reconcileAt > processAt, 'commercial floor must be re-applied after inbound AI/Base writes');
});

test('Lark QR UX remains one active card with requested two-row actions and terminal states', () => {
  const cards = read('src/providers/lark/payment.cards.ts');
  assert.match(cards, /"✅ ยืนยันสร้าง \+ ส่ง LINE"/);
  assert.match(cards, /twoColumns\(/);
  assert.match(cards, /"✏️ แก้ไขยอดเงิน"/);
  assert.match(cards, /"❌ ยกเลิก"/);
  assert.match(cards, /"✅ ส่ง QR ชำระเงินแล้ว"/);
  assert.match(cards, /"⚪ QR ชำระเงิน — ยกเลิกแล้ว"/);

  const service = read('src/services/payment-card-action.service.ts');
  assert.match(service, /ui:payment-card:/);
  assert.match(service, /await this\.lark\.patchCard\(previous\.messageId, preview\)/);
});

test('controlled live repair operators are plan-first and scoped', () => {
  const options = read('scripts/reconcile-lark-base-lifecycle-options.mjs');
  const recovery = read('scripts/recover-failed-qr-case.mjs');
  assert.match(options, /apply: false/);
  assert.match(options, /Customers.*customer_stage/s);
  assert.match(options, /Sales_Deals.*pipeline_stage/s);
  assert.match(options, /\+field-update/);
  assert.match(options, /--yes/);

  assert.match(recovery, /apply: false/);
  assert.match(recovery, /deal_status !== "Open"/);
  assert.match(recovery, /case_status !== "PAYMENT"/);
  assert.match(recovery, /payment_status/);
  assert.match(recovery, /status='QUOTED'/);
  assert.doesNotMatch(recovery, /U[0-9a-f]{20,}/i);
});
