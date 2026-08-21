const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCaseCard } = require('../.tmp-test/providers/lark/lark.cards.js');

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
    case_id: 'case-1', line_user_id: 'U1', customer_id: 'line:U1',
    customer_record_id: null, tracking_record_id: null, root_message_id: 'om_1', thread_id: null,
    owner_open_id: owner, owner_name: owner ? 'Sales A' : null, status,
    opened_at: 1000, claimed_at: owner ? 2000 : null, first_response_at: null, closed_at: null,
    latest_line_message_id: 'm1', latest_message_text: 'hello', latest_intent: 'general_inquiry',
    deal_record_id: null, card_version: 1, updated_at: 1000,
  };
}

function actionNames(card) {
  const values = [];
  for (const element of card.elements || []) {
    for (const action of element.actions || []) {
      if (action.value && action.value.action) values.push(action.value.action);
    }
  }
  return values;
}

test('NEW card exposes only atomic claim action', () => {
  const card = buildCaseCard({ route: route('NEW'), customerName: 'ลูกค้า', latestMessage: 'hello', ai });
  assert.deepEqual(actionNames(card), ['claim_case']);
});

test('CLAIMED card exposes sales tools', () => {
  const card = buildCaseCard({ route: route('CLAIMED', 'ou_sales'), customerName: 'ลูกค้า', latestMessage: 'hello', ai });
  assert.deepEqual(actionNames(card), ['open_quote_form', 'open_qr_form', 'close_deal_prompt', 'open_campaign_form', 'close_case']);
});

test('WON card locks financial actions and only allows close case', () => {
  const card = buildCaseCard({ route: route('WON', 'ou_sales'), customerName: 'ลูกค้า', latestMessage: 'paid', ai, dealAmount: 45000 });
  assert.deepEqual(actionNames(card), ['close_case']);
  assert.match(card.header.title.content, /^WON/);
});

test('RESOLVED card is report-only', () => {
  const r = route('RESOLVED', 'ou_sales');
  r.first_response_at = 5000;
  r.closed_at = 11000;
  const card = buildCaseCard({ route: r, customerName: 'ลูกค้า', latestMessage: 'done', ai, dealAmount: 45000, performance: { closed_won_amount: 100000, closed_won_count: 2 } });
  assert.deepEqual(actionNames(card), []);
  assert.equal(card.header.template, 'grey');
});
