# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-23 (ICT)

## Current Status

**PRODUCT RELEASE 0.3.0 / GOLDEN SINGLE-STACK LIVE / EXACTLY 3 LARK BASE BUSINESS TABLES / NO R2 / LINE + LARK CALLBACKS LIVE / QUOTE E2E PASSED / PERSON OWNER PASSED / THREAD → LINE PASSED / ROOT-CHAT ISOLATION PASSED / LOW-LATENCY QUEUE TUNING ACCEPTED / QR + COMMERCIAL-LIFECYCLE CORRECTION CODE VERIFIED IN CI #257 / LIVE SELECT-OPTION RECONCILIATION + FAILED-QR TEST RECOVERY + WORKER DEPLOY ARE THE NEXT CONTROLLED OPERATIONS.**

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
- D1 `line-lark-sales-crm`
- Queue `line-lark-sales-crm-events`
- DLQ `line-lark-sales-crm-events-dlq`
- Workers AI binding enabled
- D1 migrations 2/2 already applied; do not rerun/rewrite them.

Worker URL:
`https://line-lark-sales-crm.kasinpod40.workers.dev`

Latest live `/health` before the current correction batch:
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

Still not accepted: burst first-message race, true two-Sales concurrent claim, specialist responder/owner preservation, media both directions, corrected QR flow, payment/Closed Won, campaigns/retry/cross-route concurrency.

## Latest Base audit — root causes found

Latest uploaded golden `.base` after the first QR test proved structure is healthy but commercial state was inconsistent:

- Customers: `customer_stage = 📄 Quotation Sent`
- Customers: `lead_quality = 🌱 New Lead`, `lead_score = 0`
- Chat CASE: `case_status = PAYMENT`, `lead_quality` blank
- Sales_Deals: `payment_status = QR Sent`, `pipeline_stage = Quotation`
- LINE actually showed a grey image placeholder instead of a usable QR image.
- `customer_stage` select also contained one accidental blank option.

This was a false-positive payment state: the system advanced Base/D1 to QR Sent/PAYMENT even though the QR image was not usable on LINE.

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

## Current verified code milestone

Exact verified code HEAD:
`e64d304dcb4b94e07955979c2d07c054df3be7d7`

GitHub CI:
- run `32620144832`
- run #257
- job `97146982117`
- result: **SUCCESS**
- `npm run check`: PASS (typecheck + tests + Worker dry-run bundle)

Key corrections in this verified line:
- canonical `💳 Payment Pending` Customer stage
- canonical `Payment Pending` Deal pipeline stage
- commercial lifecycle reconciler prevents AI no-demotion regressions
- CASE `lead_quality` reconciliation
- one-active-card QR UX
- QR embedded in LINE Flex
- QR route render preflight before state advancement
- hardened PNG GET/HEAD response
- exact D1 deal-record lookup retained
- plan-first lifecycle select-field reconciler
- controlled failed-QR test recovery operator
- regression tests for contract/lifecycle/QR ordering/operator syntax

## Controlled live operation next

Do this once against the existing golden stack; do not recreate Base/D1/Queue/DLQ and do not rerun migrations:

1. Sync Mac branch to exact verified HEAD above.
2. Run `scripts/reconcile-lark-base-lifecycle-options.mjs --apply` against the existing Base. It is scoped to exactly:
   - `Customers.customer_stage`
   - `Sales_Deals.pipeline_stage`
   It removes the accidental blank stage option and adds the canonical Payment Pending options with readback verification.
3. Run `scripts/recover-failed-qr-case.mjs --apply` for the known controlled test case. It fail-closes unless the current case is Open + PAYMENT + QR Sent/Pending QR Send, then rolls only that failed QR attempt back to the last verified QUOTED state in Base and D1.
4. Deploy the existing Worker using the already-configured local `wrangler.jsonc` and existing secrets.
5. Verify `/health` remains HTTP 200 and `configuration.ready=true`.
6. Reopen `💳 ส่ง QR ชำระเงิน` from the existing Case Card and validate the corrected single-card → embedded-QR LINE flow.
7. After successful QR, verify Base reads:
   - Customer `💳 Payment Pending`
   - Customer `🔥 Hot Lead`, score >=80, hot=true
   - Chat CASE `PAYMENT`, lead_quality `🔥 Hot Lead`
   - Deal pipeline `Payment Pending`
   - payment_status `QR Sent`
8. Then proceed to payment/Closed Won E2E.

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
