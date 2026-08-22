# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Current Status

**PRODUCT CODE-COMPLETE FOR THE CURRENT PM + SRS SCOPE / REUSABLE RELEASE CONTRACT ADDED / EXACT CODE CHECKPOINT VERIFIED / WAITING FOR THE PRIVATE GOLDEN-STACK CONTROLLED E2E.**

There is no DEV/UAT/STAGING/PROD ladder for this product build. Local work and GitHub CI are verification gates only.

## Requirements authority

Chronology is locked:
1. Full customer SRS/SOW existed first.
2. PM later sent the concise five-function summary and linked back to the SRS.

Primary PM acceptance view:
1. Customer Card + AI + atomic Claim Case.
2. Quote + PromptPay QR sales tools.
3. Smart Deal Closing → `Sales_Deals` + Active Customer.
4. Resolved Card → Case SLA + Sales cumulative revenue/deal count.
5. VIP / retarget CRM multicast.

Detailed SRS remains supporting specification for collaboration, Thread isolation, media, callback/reliability behavior, command variants, VIP handling, SLA labels and broadcast validation.

## Product release / verified code

Product release: `0.3.0`

Last code-bearing verified SHA:
`15900c2e371b15a9daf05b85a1340214f01be915`

Verified CI:
- run `32549836467` / run #102
- job `96974655016`
- result: **SUCCESS**
- dependency audit: 0 vulnerabilities
- TypeScript strict typecheck: PASS
- unit/contract tests: **36/36 PASS**
- Wrangler deploy dry-run bundle: PASS

A later documentation/release-rules checkpoint `32ff3e7dbf9471e0e3f2baca8f85b6aec22a9012` also passed CI run `32549938247` / run #107.

Any future source/config/test/migration change requires exact code HEAD CI again before runtime changes.

## Reusable product lock

Exactly three Lark Base business tables:
1. `Customers`
2. `Chat_Tracking`
3. `Sales_Deals`

No Product or separate Quotation table. All field/API contracts use lower `snake_case`.

Reusable release/install contract:
- `deploy/product-manifest.json`
- `docs/lark-base-schema.md`
- `docs/setup.md`
- D1 migrations in manifest order
- deployment readiness validator + `/health`
- no customer-specific business-logic forks by default

## Private prebuild → PM presentation handoff — LOCKED

The product is intentionally being completed **before the PM formally starts the work** so difficult engineering/integration work is finished without official delivery-clock pressure and without repeatedly waiting for PM approval to create/change Lark App permissions.

### Phase A — private golden/reference build now

Build and fully test the first installation using:
- owner's personal Lark workspace / personal Lark Base
- owner-controlled Lark App/Bot and Sales Inbox
- owner's existing Cloudflare Worker/D1/R2/Queue/DLQ resources
- controlled reference/test LINE OA and PromptPay configuration

This private Lark installation is the engineering/reference build, not a separate DEV/UAT ladder.

Use it to finish the full controlled E2E, discover real Lark/LINE integration mismatches, and establish real implementation-time evidence.

Do not put real customer production data or credentials into the private reference Base.

### Phase B — when PM formally starts

The PM also uses the owner's Cloudflare, therefore **Cloudflare remains the same infrastructure** for the PM presentation phase.

The primary handoff is the **Lark side**:
1. keep the same verified application release and Cloudflare Worker/D1/R2/Queue/DLQ
2. transfer Lark ownership/control if cleanly supported, or create a fresh PM-controlled Lark Base/App/Bot/Sales Inbox from the same release/schema/manifest
3. replace only Lark-specific app credentials, verification/encryption values, Base/table IDs, chat ID and other changed resource identities
4. update Cloudflare secrets/vars to point to the PM-controlled Lark resources
5. run `/health` and rerun the affected controlled E2E flows
6. PM then uses that PM-controlled Lark installation for customer presentation/demo

This is **not** a Cloudflare migration and not DEV → PROD promotion.

See `docs/pm-presentation-handoff.md`.

### Phase C — customer sale/approval

A sold customer receives the same verified product blueprint. Whether Cloudflare stays owner-managed or becomes customer-controlled is a commercial/operational decision for that installation; business logic remains reusable and customer-specific values stay in configuration/secrets/bindings.

## Implemented code coverage

- LINE HMAC webhook verification, Queue normalization and retry/redelivery handling
- D1 event/action idempotency, one active case per LINE user and atomic Claim Case
- LINE profile/customer sync
- AI/rule purchase/price/support/demo/general intent, lead quality and actionable guidance
- Lark Card Schema 2.0 blue/green/grey lifecycle and same-card updates
- central Sales Inbox + one root Card/Thread per case
- collaborative Thread replies with one Case Owner for KPI/deal attribution
- root-chat isolation + orange warning
- actual responder audit rows
- two-way text/image/file/PDF/audio/location/sticker-safe bridge mappings
- R2 expiring media + D1 media metadata
- Quote → Preview/Confirm → persisted `Sales_Deals` → LINE Flex
- persisted amount → PromptPay QR Preview/Confirm → LINE
- Smart Close variants + direct Closed Won snapshot
- Payment Confirmation + Active Customer + config-driven VIP
- First Response SLA <=5m Fast rule + separate Resolution
- Sales Closed Won aggregate on resolved Card
- VIP/retarget/broadcast Preview/Confirm → Queue → <=500 multicast batches + retry/fallback
- deployment validator and safe `/health` readiness gate

## Next work

1. Create the private golden Lark Base in the owner's personal workspace from `docs/lark-base-schema.md`.
2. Create/configure owner-controlled Lark App/Bot and Sales Inbox.
3. Use the existing owner Cloudflare account/resources for Worker/D1/R2/Queue/DLQ.
4. Apply D1 migrations exactly in `deploy/product-manifest.json` order.
5. Configure reference LINE/Lark/PromptPay values and bindings.
6. Require `/health` HTTP 200 with `configuration.ready=true`.
7. Enable callbacks/webhook only after readiness is green.
8. Run the full controlled E2E in `docs/setup.md`.
9. Fix only real integration mismatches and rerun affected flows.
10. When PM formally starts, change only the Lark ownership/installation side while retaining the same Cloudflare infrastructure.

## Handoff read order

1. `AGENTS.md`
2. `docs/current-task.md`
3. `docs/requirements-authority.md`
4. `docs/pm-presentation-handoff.md`
5. `docs/customer-deployment-model.md`
6. `deploy/product-manifest.json`
7. `docs/customer-srs-sow-2026-08-22.md`
8. `docs/customer-srs-gap-analysis.md`
9. `docs/schema-naming-convention.md`
10. `docs/lark-base-schema.md`
11. `docs/setup.md`
12. current PR #1 exact HEAD + CI evidence

Never describe the SRS as a later scope expansion. Never describe this as DEV → UAT → PROD. For PM presentation handoff, **Lark changes while Cloudflare remains the owner's existing shared infrastructure** unless an explicit later decision changes that.