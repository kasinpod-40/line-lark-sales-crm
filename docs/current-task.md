# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Current Status

**PRODUCT CODE-COMPLETE FOR THE CURRENT PM + SRS SCOPE / REUSABLE RELEASE CONTRACT ADDED / EXACT CODE HEAD CI VERIFIED / WAITING ONLY FOR THE GOLDEN-STACK CONTROLLED E2E.**

There is no DEV/UAT/STAGING/PROD ladder for our product build. Local work and GitHub CI are verification gates only.

## Private prebuild → official PM handoff — LOCKED

This product is intentionally being completed **before the PM formally starts the project**.

Purpose:
- finish the difficult engineering work while there is no official delivery-clock pressure
- measure the real implementation/integration effort before estimating the official work
- avoid losing time waiting for PM/customer approval every time a Lark App permission or integration setting needs to change
- when the PM officially starts the work, hand over a presentation-ready installation instead of starting development from zero

### Phase A — private golden/reference build now

Build the first complete installation in the owner's **personal Lark workspace / personal Lark Base** with owner-controlled Lark App/Bot, reference LINE OA and Cloudflare resources.

This is our private golden/reference stack. It is not a disposable DEV/UAT environment.

Use it to:
- finish the product
- run the complete controlled E2E
- discover real Lark/LINE/Cloudflare integration mismatches
- establish known-good behavior and real effort evidence
- retain a reusable reference for future installations

Do not place real customer production credentials or real customer business data in this private stack.

### Phase B — when PM officially starts

Move the same verified product under **PM-controlled Lark resources** so the PM can present/demo it to the customer.

Do not restart development and do not change business logic merely because ownership changes.

Preferred handoff:
1. If Lark resource ownership can be transferred safely in the actual tenant arrangement, transfer control/ownership of the relevant Base/App/Bot/Sales Inbox to the PM.
2. If direct transfer is not cleanly supported (for example cross-tenant or tenant-bound app resources), create a fresh PM-controlled installation from the same verified release using `deploy/product-manifest.json`, `docs/lark-base-schema.md` and `docs/setup.md`.
3. Move/copy only presentation/demo business data if needed. Never copy secrets, retry/idempotency state or customer credentials.
4. Replace only PM-specific secrets, vars, bindings, Base/table/chat IDs and other resource identities.
5. Run the same controlled E2E on the PM-controlled installation before presentation.

The PM handoff is an installation/ownership handoff, **not** DEV → PROD promotion.

### Phase C — customer sale/approval

When the product is sold/approved for a customer, create the customer installation from the same verified product release/schema/migrations/workflow contract. Customer-specific differences belong in configuration, not customer-specific forks of the core code.

See:
- `docs/single-stack-delivery.md`
- `docs/customer-deployment-model.md`
- `deploy/product-manifest.json`

## Requirements authority

Chronology is locked:
1. Full customer SRS/SOW existed first.
2. PM later sent the concise five main functions and explicitly linked back to the SRS.

Primary PM acceptance view:
1. Customer Card + AI + atomic Claim Case.
2. Quote + PromptPay QR sales tools.
3. Smart Deal Closing → `Sales_Deals` + Active Customer.
4. Resolved Card → Case SLA + Sales cumulative revenue/deal count.
5. VIP / retarget CRM multicast.

The detailed SRS remains the supporting specification for collaboration, Thread isolation, media, callback/reliability behavior, command variants, VIP handling, SLA labels and broadcast validation.

## Exact verified code checkpoint

Product release: `0.3.0`

Last code-bearing verified SHA:
`15900c2e371b15a9daf05b85a1340214f01be915`

GitHub CI:
- run `32549836467` / run #102
- job `96974655016`
- result: **SUCCESS**
- `npm install --ignore-scripts`: SUCCESS
- dependency audit: **0 vulnerabilities**
- TypeScript strict typecheck: SUCCESS
- unit/contract tests: **36/36 PASS**
- Wrangler deploy dry-run bundle: SUCCESS

The later branch checkpoint `32ff3e7dbf9471e0e3f2baca8f85b6aec22a9012` was also verified by CI run `32549938247` / run #107 with SUCCESS. Changes after the code-bearing checkpoint are documentation/release-rule changes unless a later source/config/test/migration diff proves otherwise.

Any future source/config/test/migration change requires exact code HEAD CI again before runtime changes.

## Implemented code coverage

- LINE HMAC webhook verification, direct-user identity and Queue normalization
- D1 event/action idempotency, one active case per LINE user and atomic Case Claim
- LINE profile resolution and customer sync
- AI/rule classification including purchase/price/support/demo/general intent, lead quality and actionable guidance
- Lark Card Schema 2.0 lifecycle with blue/green/grey state and multi-device updates
- one central Sales Inbox + one root Case Card + one Thread per case
- collaborative Thread replies while preserving one Case Owner for KPI/deal attribution
- strict root-chat isolation with visible orange warning; root messages never bridge to LINE
- actual responder identity recorded on outbound MESSAGE audit rows
- two-way text/image/file/PDF/audio/location/sticker-safe mappings with explicit platform fallbacks
- R2 expiring media assets and D1 media metadata
- manual Quote → Preview/Confirm → persisted `Sales_Deals` snapshot → LINE Flex
- persisted amount → QR Preview/Confirm → PromptPay PNG → LINE
- Smart Close variants including `ปิดยอด 45000`, `ยอดเงิน 150000` and context-gated bare amount confirmation
- Closed Won → Payment Confirmation → Customer `🏆 Active Customer`
- configurable Gold/Diamond VIP thresholds; preserve current status when thresholds are unset
- First Response SLA with <=5-minute Fast label; Resolution tracked separately
- Sales cumulative Closed Won amount/count on the same resolved root Card
- VIP/retarget/broadcast flow with Preview/Confirm, strict LINE user-ID filtering, Queue dispatch, <=500 multicast batches, retry-key state and safe individual fallback
- callback work detached from the immediate Lark response using Worker `waitUntil()` where applicable
- deployment validator + safe `/health` readiness gate
- machine-readable reusable installation contract at `deploy/product-manifest.json`

## Architecture lock

Customers remain in LINE OA. Sales/Support/Manager operate from Lark.

Target:
`LINE/Lark → Cloudflare Worker → Queue/D1/R2/Workers AI → Lark Messenger/Lark Base/LINE API`

Cloudflare-native reliability is authoritative where it provides the required SRS outcome:
- D1 distributed atomic/unique control instead of process-local Promise lock authority
- Queue retry/DLQ/idempotency instead of long-running-process crash handlers
- Worker observability instead of durable local `logs/*.log`
- HTTPS Worker ingress instead of adding NGINX solely to match a diagram

## Lark Base lock

Exactly three business tables:
1. `Customers`
2. `Chat_Tracking`
3. `Sales_Deals`

No Product or separate Quotation table.

All field/API contracts use lower `snake_case`.

Use `docs/lark-base-schema.md` as the final Base creation contract.

## Next work — private golden/reference stack

No intentional feature backlog remains for the accepted PM + SRS scope.

Next:
1. Create the golden Lark Base in the owner's personal Lark workspace from `docs/lark-base-schema.md`.
2. Create/configure the owner-controlled Lark App/Bot and Sales Inbox.
3. Provision the golden Worker, D1, R2, Queue/DLQ and optional Workers AI binding.
4. Apply D1 migrations exactly in `deploy/product-manifest.json` order.
5. Configure reference LINE/Lark credentials, table IDs, PromptPay target, bindings and public Worker URL.
6. Require `/health` HTTP 200 with `configuration.ready=true`.
7. Enable Lark callbacks and LINE webhook only after readiness is green.
8. Execute `docs/setup.md` controlled E2E on the private golden/reference stack.
9. If any mismatch appears, fix only the root cause, pass CI for code changes, then rerun the affected flow.
10. Record actual setup/E2E effort and integration blockers so official PM timing can be estimated from evidence rather than guesswork.
11. When PM officially starts, perform the PM-controlled Lark handoff/install immediately from the verified product rather than restarting development.

## Handoff read order

1. `AGENTS.md`
2. `docs/current-task.md`
3. `docs/requirements-authority.md`
4. `docs/single-stack-delivery.md`
5. `docs/customer-deployment-model.md`
6. `deploy/product-manifest.json`
7. `docs/customer-srs-sow-2026-08-22.md`
8. `docs/customer-srs-gap-analysis.md`
9. `docs/schema-naming-convention.md`
10. `docs/lark-base-schema.md`
11. `docs/setup.md`
12. current PR #1 exact HEAD + CI evidence

Never describe the SRS as a later scope expansion. Never describe our product build as DEV → UAT → PROD. Never treat PM/customer ownership changes as a reason to fork the core business logic. The personal Lark workspace is the private golden/reference target used to finish the product before the official PM start.
