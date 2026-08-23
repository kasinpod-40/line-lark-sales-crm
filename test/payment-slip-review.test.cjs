const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('payment slip review card is manual-only and routes through existing close confirmation', () => {
  const source = read('src/providers/lark/payment-slip.card.ts');
  assert.match(source, /ตรวจสอบหลักฐานการชำระเงิน/);
  assert.match(source, /AI ไม่ได้ยืนยันธุรกรรมธนาคาร/);
  assert.match(source, /ยอดในสลิปไม่ตรง Deal/);
  assert.match(source, /close_deal_prompt/);
  assert.doesNotMatch(source, /confirm_close_deal/);
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
