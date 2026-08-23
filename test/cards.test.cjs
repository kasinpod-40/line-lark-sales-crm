const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCaseCard,
  buildQuoteFormCard,
  buildQuoteItemCountCard,
  buildPaymentFormCard,
  buildCampaignFormCard,
  buildThreadGuardWarningCard,
} = require('../.tmp-test/providers/lark/lark.cards.js');

const ai = {
  intent: 'general_inquiry',
  buyer_intent: 'Interested',
  customer_stage: 'Interested',
  lead_score: 50,
  hot_lead: false,
  ai_summary: 'สนใจสินค้า',
};

function route(status, owner = null) {
  return {
    case_id: 'case-1', line_user_id: 'U11111111111111111111111111111111', customer_id: 'line:U1',
    customer_record_id: null, tracking_record_id: null, root_message_id: 'om_1', thread_id: null,
    owner_open_id: owner, owner_name: owner ? 'Sales A' : null, status,
    opened_at: 1000, claimed_at: owner ? 2000 : null, first_response_at: null, closed_at: null,
    latest_line_message_id: 'm1', latest_message_text: 'hello', latest_intent: 'general_inquiry',
    deal_record_id: null, card_version: 1, updated_at: 1000,
  };
}

function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  for (const child of Object.values(value)) walk(child, visit);
}

function actionNames(card) {
  const values = [];
  walk(card.body && card.body.elements, (node) => {
    if (node.tag !== 'button' || !Array.isArray(node.behaviors)) return;
    for (const behavior of node.behaviors) {
      if (behavior && behavior.type === 'callback' && behavior.value && behavior.value.action) {
        values.push(behavior.value.action);
      }
    }
  });
  return values;
}

function cardText(card) {
  return JSON.stringify(card);
}

function assertCard2(card) {
  assert.equal(card.schema, '2.0');
  assert.ok(card.body && Array.isArray(card.body.elements));
  assert.equal(Object.prototype.hasOwnProperty.call(card, 'elements'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(card.config || {}, 'wide_screen_mode'), false);
  assert.equal(card.config.width_mode, 'fill');
  let legacyAction = false;
  walk(card, (node) => { if (node.tag === 'action') legacyAction = true; });
  assert.equal(legacyAction, false);
}

test('NEW card is Card 2.0 and exposes only atomic claim action', () => {
  const card = buildCaseCard({ route: route('NEW'), customerName: 'ลูกค้า', latestMessage: 'hello', ai });
  assertCard2(card);
  assert.equal(card.config.update_multi, true);
  assert.deepEqual(actionNames(card), ['claim_case']);
  assert.equal(card.header.template, 'blue');
  assert.match(card.header.title.content, /LINE Client/);
});

test('CLAIMED Card 2.0 exposes sales tools and owner', () => {
  const card = buildCaseCard({ route: route('CLAIMED', 'ou_sales'), customerName: 'ลูกค้า', latestMessage: 'hello', ai });
  assertCard2(card);
  assert.deepEqual(actionNames(card), ['open_quote_form', 'open_qr_form', 'close_deal_prompt', 'open_campaign_form', 'close_case']);
  assert.equal(card.header.template, 'green');
  assert.match(card.header.title.content, /Sales A/);
});

test('WON card locks financial actions and only allows close case', () => {
  const card = buildCaseCard({ route: route('WON', 'ou_sales'), customerName: 'ลูกค้า', latestMessage: 'paid', ai, dealAmount: 45000 });
  assertCard2(card);
  assert.deepEqual(actionNames(card), ['close_case']);
  assert.match(card.header.title.content, /^🏆/);
});

test('RESOLVED card is report-only and shows Fast SLA separately from resolution', () => {
  const r = route('RESOLVED', 'ou_sales');
  r.first_response_at = 46000;
  r.closed_at = 361000;
  const card = buildCaseCard({ route: r, customerName: 'ลูกค้า', latestMessage: 'done', ai, dealAmount: 45000, performance: { closed_won_amount: 100000, closed_won_count: 2 } });
  assertCard2(card);
  assert.deepEqual(actionNames(card), []);
  assert.equal(card.header.template, 'grey');
  assert.match(cardText(card), /Fast/);
  assert.match(cardText(card), /Resolution/);
  assert.match(cardText(card), /100,000/);
});

test('root-chat guard warning is Card 2.0 and explicitly says message was not sent to LINE', () => {
  const card = buildThreadGuardWarningCard();
  assertCard2(card);
  assert.equal(card.header.template, 'orange');
  assert.match(cardText(card), /ไม่ได้ส่งไป LINE/);
  assert.match(cardText(card), /Reply in Thread/);
});

test('quote flow asks item count before opening a long form', () => {
  const chooser = buildQuoteItemCountCard('case-1');
  assertCard2(chooser);
  assert.deepEqual(actionNames(chooser), [
    'open_quote_form_count',
    'open_quote_form_count',
    'open_quote_form_count',
    'open_quote_form_count',
    'open_quote_form_count',
  ]);
  assert.match(cardText(chooser), /1 รายการ/);
  assert.match(cardText(chooser), /5 รายการ/);
});

test('quote form defaults to one item and renders only selected item count', () => {
  const one = buildQuoteFormCard('case-1', 7);
  const three = buildQuoteFormCard('case-1', 7, 3);
  assert.match(cardText(one), /รายการ 1/);
  assert.doesNotMatch(cardText(one), /รายการ 2/);
  assert.match(cardText(three), /รายการ 1/);
  assert.match(cardText(three), /รายการ 2/);
  assert.match(cardText(three), /รายการ 3/);
  assert.doesNotMatch(cardText(three), /รายการ 4/);
});

test('Card 2.0 forms use form_action_type submit and callback behavior', () => {
  const cards = [
    buildQuoteFormCard('case-1', 7),
    buildPaymentFormCard('case-1', 45000),
    buildCampaignFormCard('case-1', 'vip'),
  ];
  for (const card of cards) {
    assertCard2(card);
    let formCount = 0;
    let submitCount = 0;
    walk(card.body.elements, (node) => {
      if (node.tag === 'form') formCount += 1;
      if (node.tag === 'button' && node.form_action_type === 'submit') {
        submitCount += 1;
        assert.ok(node.name);
        assert.ok(Array.isArray(node.behaviors));
        assert.equal(node.behaviors[0].type, 'callback');
        assert.ok(node.behaviors[0].value.action);
      }
    });
    assert.equal(formCount, 1);
    assert.equal(submitCount, 1);
  }
});