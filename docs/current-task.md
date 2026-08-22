# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Current Status

**PRODUCT CODE-COMPLETE FOR THE CURRENT PM + SRS SCOPE / REUSABLE RELEASE CONTRACT ADDED / EXACT CODE HEAD CI VERIFIED / WAITING ONLY FOR THE SINGLE FINAL-STACK CONTROLLED E2E.**

There is **no DEV, UAT, STAGING, or PROD environment ladder** for our golden implementation. Local work and GitHub CI are verification gates only. We will provision our real LINE/Lark/Cloudflare target once, run the controlled E2E on that same stack, and retain it as the product's golden/reference stack.

The commercial model is locked: every sold customer receives a fresh installation of the **same verified product release** in customer-specific LINE/Lark/Cloudflare resources. We change configuration/secrets/resource IDs, not business logic. Per-customer forks are not the default architecture.

Read:
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

Documentation-only commits may follow this checkpoint. If any source/config/test/migration code changes after this SHA, exact code HEAD CI must pass again before external setup.

## Implemented code coverage

- LINE HMAC webhook verification, direct-user identity and Queue normalization
- D1 event/action idempotency, one active case per LINE user and atomic Case Claim
- LINE profile resolution and customer sync
- AI/rule classification including purchase/price/support/demo/general intent presentation, lead quality and actionable guidance
- Lark Case Card lifecycle with Schema 2.0, blue/green/grey state and multi-device update config
- one central Sales Inbox + one root Case Card + one Thread per case
- collaborative Thread replies while preserving one Case Owner for KPI/deal attribution
- strict root-chat isolation with visible orange warning; root messages never bridge to LINE
- actual responder identity recorded on outbound MESSAGE audit rows
- two-way text/image/file/PDF/audio/location/sticker-safe mappings with explicit platform fallbacks
- R2 expiring media assets and D1 media metadata
- manual Quote → Preview/Confirm → persisted `Sales_Deals` snapshot → LINE Flex
- persisted amount → QR Preview/Confirm → PromptPay PNG → LINE
- Smart Close command variants including `ปิดยอด 45000`, `ยอดเงิน 150000` and context-gated bare amount confirmation
- Closed Won → Payment Confirmation → Customer `🏆 Active Customer`
- configurable Gold/Diamond VIP thresholds; preserve current status when thresholds are unset
- First Response SLA with <=5-minute Fast label; Resolution tracked separately
- Sales cumulative Closed Won amount/count on the same resolved root Card
- VIP/retarget/broadcast command flow with Preview/Confirm, strict LINE user-ID filtering, Queue dispatch, <=500 multicast batches, retry-key state and safe individual fallback
- callback work detached from the immediate Lark response using Worker `waitUntil()` where applicable

## Reusable deployment hardening completed

- product version aligned to `0.3.0`
- machine-readable `deploy/product-manifest.json` added
- manifest locks the three-table contract, D1 migration order, required bindings, secrets/vars and callback paths
- runtime deployment validator added
- `/health` returns HTTP `200` only when blocking installation configuration is ready
- incomplete/malformed installation returns HTTP `503` with safe issue codes/messages and no secret values
- validator rejects missing required config/bindings, obvious placeholder IDs, invalid HTTPS public URL, PromptPay target/type mismatch, invalid VAT/TTL and invalid VIP threshold ordering
- Workers AI and VIP thresholds remain optional warnings because the product has deterministic/safe fallback behavior
- tests lock manifest contents and credential-free contract

## Architecture lock

Customers remain in LINE OA. Sales/Support/Manager operate from Lark.

Target:
`LINE/Lark → Cloudflare Worker → Queue/D1/R2/Workers AI → Lark Messenger/Lark Base/LINE API`

Cloudflare-native reliability is authoritative where it provides the required SRS outcome:
- D1 distributed atomic/unique control instead of process-local Promise lock authority
- Queue retry/DLQ/idempotency instead of long-running-process crash handlers
- Worker observability instead of durable local `logs/*.log`
- HTTPS Worker ingress instead of adding NGINX solely to match a diagram

## Reusable product / golden-stack lock

Our own completed installation is the canonical **golden/reference stack**, not a disposable DEV environment.

For each sold customer:
- use the same verified release/SHA + matching `deploy/product-manifest.json`
- create the same 3-table Base contract
- apply the same D1 migrations in manifest order
- use the same Card/Thread/Quote/QR/Deal/SLA/Broadcast logic
- provide customer-specific LINE/Lark/PromptPay/Cloudflare configuration through secrets, vars and bindings
- never hard-code customer credentials, Base/table IDs, chat IDs or resource IDs in source
- avoid per-customer code forks; reusable variations should be configuration/features in the main product where feasible
- require `/health` ready before enabling callbacks
- run the same controlled E2E on the customer's final installation before handoff

Our golden stack must not contain real customer credentials/data merely to serve as a deployment template.

## Lark Base lock

Exactly three business tables:
1. `Customers`
2. `Chat_Tracking`
3. `Sales_Deals`

No Product or separate Quotation table.

All field/API contracts use lower `snake_case`.

Use `docs/lark-base-schema.md` as the final Base creation contract.

## Only remaining work — external runtime

No intentional code feature backlog remains for the accepted PM + SRS scope.

Next:
1. Create our real final Lark Base once from `docs/lark-base-schema.md`.
2. Provision our final Worker, D1, R2, Queue/DLQ, Lark App/Bot and Sales Inbox once.
3. Apply D1 migrations exactly in `deploy/product-manifest.json` order.
4. Configure final LINE/Lark credentials, table IDs, PromptPay target, bindings and public Worker URL.
5. Require `/health` HTTP 200 with `configuration.ready=true`.
6. Enable Lark callbacks and LINE webhook only after readiness is green.
7. Execute `docs/setup.md` controlled E2E directly on this final golden stack.
8. If any mismatch appears, fix only the root cause, pass CI, then rerun the affected flow on the same stack.
9. When all acceptance steps pass, mark the same stack `live-ready` and `reusable-ready`; there is no environment promotion or data migration afterward.

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

Never describe the SRS as a later scope expansion. Never describe our delivery as DEV → UAT → PROD. Never treat a customer installation as a reason to fork the core business logic.
