const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDeploymentConfig } = require('../.tmp-test/config/validation.js');
const { handleHealth } = require('../.tmp-test/routes/health.route.js');

function validEnv() {
  return {
    LINE_CHANNEL_SECRET: 'line-secret',
    LINE_CHANNEL_ACCESS_TOKEN: 'line-token',
    LINE_EVENTS_QUEUE: { send: async () => undefined },
    DB: {},
    AI: { run: async () => ({}) },
    LARK_APP_ID: 'cli_a1b2c3d4',
    LARK_APP_SECRET: 'lark-secret',
    LARK_VERIFICATION_TOKEN: 'verify-token',
    LARK_SALES_INBOX_CHAT_ID: 'oc_a1b2c3d4',
    LARK_BASE_APP_TOKEN: 'bascn_a1b2c3d4',
    LARK_BASE_CUSTOMERS_TABLE_ID: 'tbl_customers_123',
    LARK_BASE_CHAT_TRACKING_TABLE_ID: 'tbl_tracking_123',
    LARK_BASE_SALES_DEALS_TABLE_ID: 'tbl_deals_123',
    PROMPTPAY_TARGET: '0812345678',
    PROMPTPAY_TARGET_TYPE: 'phone',
    PUBLIC_BASE_URL: 'https://crm.example.com',
    COMPANY_NAME: 'Example Co',
    QUOTE_DEFAULT_VAT_RATE: '7',
    QR_TTL_SECONDS: '604800',
    MEDIA_TTL_SECONDS: '604800',
    VIP_GOLD_MIN_THB: '100000',
    VIP_DIAMOND_MIN_THB: '500000',
  };
}

test('complete Lark-first deployment configuration is ready without R2', () => {
  const result = validateDeploymentConfig(validEnv());
  assert.equal(result.ready, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.checks.line, true);
  assert.equal(result.checks.lark, true);
  assert.equal(result.checks.lark_base, true);
  assert.equal(result.checks.operational_state, true);
  assert.equal(result.checks.media, true);
  assert.equal(result.errors.some((issue) => issue.key === 'MEDIA_BUCKET'), false);
});

test('invalid public URL and reversed VIP thresholds fail readiness', () => {
  const env = validEnv();
  env.PUBLIC_BASE_URL = 'http://insecure.example.com/path';
  env.VIP_GOLD_MIN_THB = '500000';
  env.VIP_DIAMOND_MIN_THB = '100000';
  const result = validateDeploymentConfig(env);
  assert.equal(result.ready, false);
  assert.ok(result.errors.some((issue) => issue.code === 'INVALID_PUBLIC_BASE_URL'));
  assert.ok(result.errors.some((issue) => issue.code === 'INVALID_VIP_THRESHOLD_ORDER'));
});

test('placeholder IDs and invalid PromptPay target fail readiness before E2E', () => {
  const env = validEnv();
  env.LARK_SALES_INBOX_CHAT_ID = 'oc_xxx';
  env.PROMPTPAY_TARGET = '12345';
  const result = validateDeploymentConfig(env);
  assert.equal(result.ready, false);
  assert.ok(result.errors.some((issue) => issue.code === 'PLACEHOLDER_CONFIG_VALUE'));
  assert.ok(result.errors.some((issue) => issue.code === 'INVALID_PROMPTPAY_TARGET'));
});

test('optional AI and VIP thresholds warn without blocking deployment', () => {
  const env = validEnv();
  delete env.AI;
  delete env.VIP_GOLD_MIN_THB;
  delete env.VIP_DIAMOND_MIN_THB;
  const result = validateDeploymentConfig(env);
  assert.equal(result.ready, true);
  assert.ok(result.warnings.some((issue) => issue.code === 'WORKERS_AI_NOT_BOUND'));
  assert.ok(result.warnings.some((issue) => issue.code === 'VIP_THRESHOLDS_NOT_CONFIGURED'));
});

test('health returns 503 for incomplete installation without exposing secret values', async () => {
  const env = validEnv();
  env.LARK_BASE_SALES_DEALS_TABLE_ID = '';
  const response = handleHealth(env);
  assert.equal(response.status, 503);
  const bodyText = await response.text();
  assert.match(bodyText, /LARK_BASE_SALES_DEALS_TABLE_ID/);
  assert.doesNotMatch(bodyText, /line-secret|line-token|lark-secret|verify-token/);
});
