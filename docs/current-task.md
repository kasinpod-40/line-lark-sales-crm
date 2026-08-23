# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-23 (ICT)

## Current Status

**PRODUCT RELEASE 0.3.0 / GOLDEN SINGLE-STACK LIVE / EXACTLY 3 LARK BASE BUSINESS TABLES / NO R2 / LINE + LARK CALLBACKS LIVE / QUOTE E2E PASSED / PERSON OWNER PASSED / THREAD → LINE PASSED / ROOT-CHAT ISOLATION PASSED / LOW-LATENCY QUEUE TUNING ACCEPTED / QR ONE-CARD PREVIEW LIVE-PASSED / WORKERS-PORTABLE QR PNG FIX VERIFIED IN CI #274 / NEXT STEP IS DEPLOY ONLY AND RETRY THE SAME ACTIVE QR PREVIEW CARD.**

There is no DEV/UAT/STAGING/PROD ladder for this product build. Local/CI are verification gates only. PR #1 remains Draft / Open / Unmerged until the remaining controlled E2E acceptance is complete.

## Locked architecture

- Lark = customer-facing CRM/frontend and stored-media authority.
- D1 = invisible technical state for claim/dedupe/routing/drafts/QR metadata/campaign/media-proxy metadata.
- Queue + DLQ = async delivery/retry.
- Worker = LINE ↔ Lark transport/orchestration.
- R2 is not required and must not be introduced unless a later explicit requirement changes the architecture.
- Exactly three Lark Base business tables: `Customers`, `Chat_Tracking`, `Sales_Deals`.
- Customer-specific IDs/credentials are configuration only; no customer-specific business-logic fork.

## Golden runtime

Dedicated Cloudflare resources:
- Worker `line-lark-sales-crm`
- D1 `line-lark-sales-crm`, UUID `752d602c-7d18-4354-9c2f-ac7b8178ba16`
- Queue `line-lark-sales-crm-events`
- DLQ `line-lark-sales-crm-events-dlq`
- Workers AI binding enabled
- D1 migrations 2/2 already applied; do not rerun/rewrite them.

Worker URL:
`https://line-lark-sales-crm.kasinpod40.workers.dev`

Latest live `/health` after lifecycle recovery/deploy:
- HTTP 200
- `ok=true`
- `configuration.ready=true`
- LINE/Lark/Base/PromptPay/operational/media/Workers AI readiness true
- only warning: `VIP_THRESHOLDS_NOT_CONFIGURED`

PromptPay remains demo configuration only. Never use the current placeholder for real payment acceptance.

## Golden Lark Base

Base: `LINE OA Sales CRM`

Table IDs:
- Customers `tblpv0icWMgX66wQ`
- Chat_Tracking `tbl0H0zavzG6EmXm`
- Sales_Deals `tblc0zJSoGCtxnJT`

Presentation authority from latest exported `.base`:
- exactly 3 business tables
- 22 curated views
- 2 dashboards
- 23 dashboard blocks
- Person field `sales` exists and current owned records contain Person values
- visible-field membership is accepted; 15 order-only differences are non-blocking because the supported Base JS SDK has no documented reorder setter. Do not rerun UX merely to chase cosmetic order.

## Controlled E2E evidence already passed

1. `/health` — PASS.
2. LINE text → one root Case Card + Thread + Base records — PASS.
3. Single-user Claim — PASS.
4. Owner Reply in Thread → exact LINE text — PASS.
5. Person `sales` ownership field — PASS visually across relevant records.
6. Queue latency tuning — accepted; user reported no perceptible hang/failure.
7. Root-chat isolation — Lark warning behavior passed and root messages are not an outbound LINE route.
8. Quote flow — PASS end-to-end:
   - Quote `QT-20260823`
   - 2 items
   - subtotal ฿30,000
   - VAT 7% = ฿2,100
   - total ฿32,100
   - one Sales_Deals record
   - LINE customer received quotation Flex
   - successful quote preview becomes green terminal card with no actions.
9. QR Lark one-card preview — PASS visually:
   - one orange preview card
   - row 1 full-width `✅ ยืนยันสร้าง + ส่ง LINE`
   - row 2 `✏️ แก้ไขยอดเงิน` | `❌ ยกเลิก`
   - amount ฿32,100

Still not accepted: QR LINE embedded image success, burst first-message race, true two-Sales concurrent claim, specialist responder/owner preservation, media both directions, payment/Closed Won, campaigns/retry/cross-route concurrency.

## Canonical commercial lifecycle — locked

Customer stage:
`🌱 New Lead → 💬 Contacted → 📄 Quotation Sent → 💳 Payment Pending → 🏆 Active Customer`

Deal pipeline:
`Lead → Quotation → Payment Pending → Payment Received → Closed Won`

Lead quality floor:
- before Quote: AI score may classify normally
- Quote Sent: at least `⚡ High Intent`, score floor 60
- Payment Pending: `🔥 Hot Lead`, score floor 80, `hot_lead=true`
- Closed Won: Active Customer; commercial maturity must not be demoted by a later generic message

`Chat_Tracking` CASE rows must also receive lifecycle `lead_quality`.

## Live lifecycle repair evidence

The controlled schema reconciliation already succeeded on the golden Base:
- Customers `customer_stage`: accidental blank option removed; `💳 Payment Pending` added.
- Sales_Deals `pipeline_stage`: `Payment Pending` added.
- mutation_count=2 with readback.

The failed old QR state was recovered to the last verified quoted state and Worker health subsequently returned ready=true. Do not rerun schema reconciliation merely because of later QR-render failures.

## QR contract — corrected and locked

The old two-message design (PromptPay Flex + separate LINE image message) is retired for the active QR flow.

Correct QR behavior:
1. `💳 ส่ง QR ชำระเงิน` opens/reuses exactly one Lark QR preview card.
2. Preview layout:
   - first row: full-width `✅ ยืนยันสร้าง + ส่ง LINE`
   - second row: `✏️ แก้ไขยอดเงิน` | `❌ ยกเลิก`
3. Edit amount updates the same card; save returns the same card to Preview.
4. Cancel → grey terminal, no actions.
5. Confirm creates the D1 QR asset and renders the exact QR route locally before any payment advancement.
6. QR PNG endpoint supports GET + HEAD with `image/png`, content length, cache metadata and `nosniff`.
7. LINE receives **one Flex Card containing the QR image in the card itself**; no separate image message.
8. Only after QR render validation + LINE push succeeds may Base/D1 advance to `QR Sent` / `PAYMENT` / Payment Pending lifecycle.
9. Success → green terminal card, no actions.
10. If QR rendering or LINE push fails, the system must not falsely mark `QR Sent`.

## QR PNG runtime incident — 2026-08-23 14:20 ICT

After the one-card Preview passed live, Confirm failed in preflight with:
`QR encoder does not expose toBuffer in this runtime`.

Root cause:
- Cloudflare Workers bundles the `qrcode` browser build.
- browser build does not expose Node-only `toBuffer()` at all; default/named export normalization cannot fix that.

Permanent correction:
- QR route no longer calls `toBuffer`.
- `src/utils/qr-png.ts` uses portable `qrcode.create()` to obtain the QR module matrix.
- the matrix is rasterized as 8-bit grayscale.
- PNG is encoded with Web Platform APIs (`CompressionStream("deflate")`) plus explicit PNG signature/IHDR/IDAT/IEND and CRC32.
- regression test generates a real PNG, parses chunks, inflates IDAT, checks dimensions/filter bytes/dark+light pixels, and asserts no `.toBuffer(` remains in the runtime QR path.

The 14:20 failure occurred during PNG preflight before `Pending QR Send`, LINE push, lifecycle advancement, or draft completion. Therefore no Base/D1 commercial rollback is required for that failure; the same active orange QR Preview may be retried after deploy.

## Current verified code milestone

Exact verified code HEAD:
`d45daaa2ee46d8be8ec9fa8d6b88f275292a11fe`

GitHub CI:
- run `32625500482`
- run #274
- job `97160117726`
- result: **SUCCESS**
- `npm run check`: PASS (typecheck + 117 tests including real PNG inflate test + Worker dry-run bundle)

## Controlled live operation next

Do not recreate Base/D1/Queue/DLQ, do not rerun migrations, do not rerun lifecycle schema reconciliation, and do not rerun failed-QR recovery for the 14:20 `toBuffer` preflight failure.

Next operation:
1. Sync Mac branch to the latest branch HEAD containing verified code HEAD `d45daaa2ee46d8be8ec9fa8d6b88f275292a11fe`.
2. Deploy the existing Worker using the already-configured local `wrangler.jsonc` and existing secrets.
3. Verify `/health` remains HTTP 200 and `configuration.ready=true`.
4. On the existing orange QR Preview card for ฿32,100, press `✅ ยืนยันสร้าง + ส่ง LINE` again; no need to open a new QR card.
5. Acceptance requires all of:
   - same Lark card becomes green terminal/no actions
   - LINE receives one Flex Card with visible QR embedded inside it
   - no separate image message / grey placeholder
   - Customer becomes `💳 Payment Pending`
   - Customer `🔥 Hot Lead`, score >=80, hot=true
   - Chat CASE `PAYMENT`, lead_quality `🔥 Hot Lead`
   - Deal pipeline `Payment Pending`
   - payment_status `QR Sent`
6. Then proceed to payment/Closed Won E2E.

## Terminal safety

Never instruct the owner to run `set -e` or `set -euo pipefail` directly in interactive macOS Terminal. Keep real credentials/secrets out of chat and source.

## Handoff read order

1. `AGENTS.md`
2. `docs/current-task.md`
3. latest PR #1 exact HEAD + CI evidence
4. `deploy/product-manifest.json`
5. `deploy/lark-base-contract.json`
6. `deploy/lark-base-ux-contract.json`
7. `docs/requirements-authority.md`
8. `docs/customer-deployment-model.md`
9. `docs/single-stack-delivery.md`
10. `docs/setup.md`
