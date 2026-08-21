# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Current Status

**CODE INTEGRATION-READY — REAL LARK/LINE E2E NOT RUN YET.**

The code layer planned for the current customer scope is implemented on Draft PR #1. The next phase is resource provisioning: create the three Lark Base tables, configure Lark/LINE/Cloudflare resources and credentials, then execute the controlled E2E checklist in `docs/setup.md`.

Do **not** call the system production-ready until that real E2E passes.

Last code-bearing verified SHA before this documentation checkpoint:

`5d72a266b26dd61991edf48251c19be375ee2969`

GitHub CI run: **#29 / job `96880042393` — SUCCESS**

Verified gates on that code:
- TypeScript strict typecheck: PASS
- Unit tests: **19/19 PASS**
- LINE webhook HMAC + queue normalization tests: PASS
- LINE retry-key `409 already accepted` behavior: PASS
- AI/rule tests: PASS
- Quote calculation tests: PASS
- Direct manual close snapshot tests: PASS
- PromptPay payload + CRC tests: PASS
- Lark Card lifecycle tests (NEW / CLAIMED / WON / RESOLVED): PASS
- Cloudflare Wrangler bundle/deploy dry-run with `nodejs_compat`: PASS
- npm audit from CI install: 0 vulnerabilities

Any later code commit invalidates this verification marker until CI passes again. Always inspect the current PR HEAD and its workflow run.

## Purpose

Build a LINE-only Sales CRM where:
- Customers remain entirely in LINE OA.
- Sales works entirely in Lark.
- Backend bridges LINE ↔ Lark.
- One central Lark Sales Inbox group is used.
- One customer case = one root Card + one Reply-in-Thread conversation.
- The root Card is the case control center; Thread is the conversation; Lark Base is business CRM storage; D1/Queues hold operational state.

## Locked Architecture

`LINE OA → signed webhook → Cloudflare Queue → LINE consumer → AI/customer/case processing → Lark root Case Card + Thread ↔ LINE`

Layering:

`Route → Service → Core → Provider/Repository`

Current important modules:
- `src/routes/line/webhook.route.ts` — LINE signature validation + event normalization.
- `src/queues/line-event.consumer.ts` — Queue retry boundary.
- `src/services/case.service.ts` — inbound LINE orchestration.
- `src/services/lark-event.service.ts` — owner-only Thread → LINE bridge + command detection.
- `src/services/card-action.service.ts` — claim/quote/QR/close/campaign orchestration.
- `src/providers/lark/lark.cards.ts` — all Lark Card/form/preview renderers.
- `src/providers/lark/lark.client.ts` — Lark messaging/image/user API client.
- `src/providers/line/line.provider.ts` — LINE profile/content/push/multicast/retry-key behavior.
- `src/providers/line/line.flex.ts` — quotation/payment/payment-confirmation/campaign Flex.
- `src/storage/operational.repository.ts` — D1 idempotency, routing, drafts, QR assets, campaign batches.
- `src/storage/lark-base.repository.ts` — exactly three Lark Base business tables.

## Locked Product Decisions

1. One Lark Sales Inbox group; do not create one Lark Chat per customer.
2. Same root Card is updated through lifecycle: `NEW → CLAIMED → IN_PROGRESS → QUOTED → PAYMENT → WON → RESOLVED`.
3. Claim is atomic; first Sales wins.
4. Only the assigned Sales can bridge Thread replies/actions to the customer.
5. Stale financial/card actions on a RESOLVED case are rejected.
6. WON root Card locks financial actions and leaves only Close Case.
7. Customers never need Lark access.
8. Reuse LINE/AI/Queue concepts extracted from `kasinpod-40/omnichannel-commerce-crm`; do not import marketplace/stock/order architecture.
9. Exactly three Lark Base business tables for current scope; no Product/Quotation table.
10. Financial outbound actions require Preview/Confirm and idempotent retry behavior.

## Implemented Capabilities

### 1. LINE inbound + AI + Sales Case
- Verify `x-line-signature` before enqueue.
- Accept direct-user LINE text/image/sticker events.
- Preserve webhook event ID/redelivery metadata.
- Queue consumer with retry/backoff.
- D1 event dedupe and one-active-case-per-LINE-user guard.
- Concurrency recovery if two Queue consumers race to open the same user case.
- LINE profile resolution with safe fallback name.
- Optional Workers AI text classification with deterministic rule fallback.
- Optional image analysis path including payment-slip signal.
- Customers with Closed Won history retain `Active Customer` business stage.
- Create blue root Lark Card for new case; later inbound events patch the same Card.
- Incoming LINE text/image is appended into that case Thread.

### 2. Atomic Claim Case
`[🙋‍♂️ รับเคสนี้]`
- D1 conditional UPDATE is the lock authority.
- First Sales wins.
- Customer owner fields are updated in Base.
- Same root Card turns to owned/green state.
- Non-owner Thread replies/actions are blocked.

### 3. Thread ↔ LINE
- Lark event processing only handles replies attached to a known case root message.
- Bot/app echoes are ignored.
- Owner text reply sends to the mapped LINE user.
- First actual Sales→LINE message records First Response SLA.
- LINE push uses stable `X-Line-Retry-Key`.
- LINE `409` for an already-accepted retry key is treated as terminal success, allowing local state to recover without duplicate delivery.
- Sales non-text reply bridging is intentionally not part of current v1; inbound customer images are supported.

### 4. Manual Quotation — no Product table
`[🎨 ส่งใบเสนอราคา]`
- Lark form supports up to 5 manual line items.
- Quantity × unit price, discount, VAT, shipping and total are calculated in core code.
- Preview/Confirm required.
- Confirm persists an immutable quotation snapshot into `Sales_Deals` **before** LINE outbound.
- LINE Flex quotation is then sent.
- Stable retry key makes repeat confirmation recoverable.
- Same root Card becomes QUOTED and displays deal amount.

### 5. PromptPay QR from persisted Deal amount
`[💳 ส่ง QR ชำระเงิน]`
- Reads latest deal/quotation total from `Sales_Deals`.
- Prefills amount but allows Sales to correct it before confirmation.
- Preview/Confirm required.
- PromptPay EMV payload + CRC generated in core code.
- 1024px PNG exposed from `/assets/qr/<token>.png`.
- QR asset token is deterministic per draft so LINE retry request body remains identical.
- Payment state is stored in `Sales_Deals` before/after outbound.
- Same root Card becomes PAYMENT.

### 6. Smart Deal Closing
Sales can type e.g. `ปิดยอด 45000` in the case Thread.
- Command creates a confirmation draft; it never mutates immediately.
- Confirm uses the latest `Sales_Deals` record if one exists.
- If no quotation/deal exists, confirmation creates a minimal auditable direct-close `Sales_Deals` snapshot instead of requiring a Product/Quotation table.
- Deal becomes `Closed Won` / `Paid`.
- Customer becomes `Active Customer`; lifetime value is recalculated from Closed Won history.
- LINE Payment Confirmation is sent (not represented as a legal tax invoice/receipt).
- Same root Card becomes WON and financial buttons are locked.

### 7. Close Case / Executive Card
`[✅ ปิดเคสนี้]`
- Case becomes RESOLVED.
- Same root Card turns report-only/grey.
- Shows First Response SLA.
- Shows Resolution time.
- Shows case deal amount when present.
- Shows owner cumulative Closed Won amount + deal count.

### 8. VIP / Retarget Campaign
Commands/actions support `vip` and `retarget`.
- Segment recipients are read from `Customers`.
- Preview shows matched LINE user count.
- Recipient snapshot is frozen in D1 draft before confirm.
- Confirm sends LINE Flex campaign in batches of max 500.
- Each batch has deterministic LINE retry key + D1 batch state.
- No blind send directly from free-text command.

## Lark Base — Locked 3 Tables

Detailed schema: `docs/lark-base-schema.md`.

### Customers
Identity/current CRM state, including LINE user ID, profile, stage, VIP, owner, AI signals, last activity and lifetime value.

### Chat_Tracking
Both CASE and MESSAGE rows, including root-message routing metadata, owner, direction, timestamps, First Response and Resolution SLA.

### Sales_Deals
Quotation snapshot, totals, QR/payment state and Closed Won history. One Customer may have many Deals; one Case may have historical quotes/deals.

Do not add Product or Quotation tables for the current scope.

## Operational State — D1, not Lark Base

`migrations/0001_operational_state.sql` creates:
- `event_dedupe`
- `case_routes`
- `action_dedupe`
- `interaction_drafts`
- `qr_assets`
- `campaign_batches`

A partial unique index enforces only one non-RESOLVED case per LINE user.

## Reliability / Safety Rules Implemented

- Signed LINE webhook before queue mutation.
- Webhook/card event dedupe with stale-failure reclaim.
- Atomic case claim.
- One-active-case uniqueness.
- Owner-only Thread bridge and actions.
- Draft creator checks on confirm/cancel.
- RESOLVED stale-action rejection.
- Financial Preview/Confirm.
- Base-first quote persistence before LINE send.
- Stable LINE retry UUIDs.
- LINE 409 accepted-retry recovery.
- Deterministic QR URL across retries.
- Campaign recipient snapshot + 500-user batching + per-batch retry state.
- No secrets committed; deployment config remains example/template only.

## What Is Still Blocked by External Resources (not unfinished code)

Real integration validation cannot be run until resources exist:
1. Lark Base with the exact 3-table schema.
2. Lark app credentials, bot permissions/event subscriptions and Sales Inbox chat ID.
3. LINE OA Channel Secret/Access Token and webhook configuration.
4. Cloudflare D1 + Queue + DLQ + Worker (+ AI binding if desired).
5. PromptPay target and public Worker URL.

Then follow `docs/setup.md` in order.

## Controlled E2E Required Before Production

1. Health/readiness.
2. LINE text → blue Card + Thread.
3. Two-sales atomic claim race.
4. Owner Thread reply → LINE; non-owner blocked.
5. Quote manual form → preview → Base → LINE Flex.
6. QR reads persisted quote → preview → PNG → LINE.
7. Customer image/payment slip → Thread + AI signal.
8. `ปิดยอด 45000` both with and without prior quote.
9. Close Case → SLA + Sales aggregate.
10. VIP/retarget preview/confirm + batch idempotency.
11. Webhook/Queue/card/LINE retry and redelivery recovery.

## Future Chat / Handoff Rule

Before changing code:
1. Read `AGENTS.md`.
2. Read this file.
3. Inspect current PR #1 HEAD and open PR state.
4. Check the CI run for that exact HEAD.
5. Never trust an old SHA merely because it appears in chat/docs.
6. Reuse current modules; do not add duplicate engines/wrappers without a demonstrated missing capability.
7. After meaningful work, update this file with the last code-bearing verified SHA, CI evidence, blockers and next action.

Next action: **create/configure the Lark Base and external resources, then run the controlled E2E once.**
