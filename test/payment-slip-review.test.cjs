const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('payment slip review shows both amounts, comparison result and two horizontal manual actions', () => {
  const source = read('src/providers/lark/payment-slip.card.ts');
  assert.match(source, /ตรวจสอบหลักฐานการชำระเงิน/);
  assert.match(source, /ยอดที่ต้องชำระ:/);
  assert.match(source, /ยอดในสลิป:/);
  assert.match(source, /ยอดชำระเงินถูกต้อง/);
  assert.match(source, /ยอดชำระเงินไม่ตรง/);
  assert.match(source, /AI ช่วยอ่านภาพและเทียบยอดเท่านั้น/);
  assert.match(source, /twoColumns\(/);
  const confirmAt = source.indexOf('"✅ ยืนยันรับชำระ"');
  const rejectAt = source.indexOf('"❌ ไม่ถูกต้อง"');
  assert.ok(confirmAt >= 0 && rejectAt > confirmAt, 'confirm and reject must share the two-column action row');
  assert.match(source, /confirm_slip_payment/);
  assert.match(source, /reject_payment_slip/);
  assert.doesNotMatch(source, /close_deal_prompt/);
});

test('existing Payment case delivers image before waiting for vision inference and enriches one review card', () => {
  const source = read('src/services/case.service.ts');
  const analysisStart = source.indexOf('const imageAnalysisPromise = analyzeImage');
  const fastImage = source.indexOf('await this.lark.replyImage(fastRoute.root_message_id, imageKey)', analysisStart);
  const analysisAwait = source.indexOf('ai = imageAiToAnalysis(await imageAnalysisPromise)', analysisStart);
  assert.ok(analysisStart >= 0, 'vision inference must start');
  assert.ok(fastImage > analysisStart, 'image should be delivered while vision is running');
  assert.ok(analysisAwait > fastImage, 'visible image delivery must happen before waiting for vision');
  assert.match(source, /fastRoute\.status === "PAYMENT"/);
  assert.match(source, /earlySlipReviewMessageId/);
  assert.match(source, /patchCard\(earlySlipReviewMessageId, reviewCard\)/);
  assert.match(source, /ลูกค้าส่งสลิป\/หลักฐานการชำระเงิน กรุณาตรวจสอบความถูกต้อง/);
  assert.match(source, /ai\.intent === "payment_slip" \|\| route\.status === "PAYMENT"/);
});

test('slip confirm uses persisted deal amount and reject does not mutate commercial state', () => {
  const source = read('src/services/payment-slip-action.service.ts');
  assert.match(source, /PAYMENT_SLIP_ACTIONS/);
  assert.match(source, /confirm_slip_payment/);
  assert.match(source, /reject_payment_slip/);
  assert.match(source, /const amount = latest\?\.deal\.payment_amount \?\? latest\?\.deal\.total_amount \?\? 0/);
  assert.match(source, /await this\.base\.closeDeal\(latest\.recordId, amount\)/);
  assert.match(source, /await this\.base\.markCustomerActive/);
  assert.match(source, /paymentConfirmationFlex/);
  const rejectStart = source.indexOf('event.action === "reject_payment_slip"');
  const confirmStart = source.indexOf('event.action !== "confirm_slip_payment"');
  assert.ok(rejectStart >= 0 && confirmStart > rejectStart);
  const rejectBlock = source.slice(rejectStart, confirmStart);
  assert.doesNotMatch(rejectBlock, /closeDeal|markCustomerActive|setCaseStatus/);
});

test('Lark webhook isolates slip review actions from generic card handlers', () => {
  const source = read('src/routes/lark/webhook.route.ts');
  assert.match(source, /PAYMENT_SLIP_ACTIONS\.has\(event\.action\)/);
  assert.match(source, /new PaymentSlipActionService\(env\)\.handle\(event\)/);
});
