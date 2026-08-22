# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Current Status

**PRODUCT CODE-COMPLETE FOR PM 5 FUNCTIONS + SUPPORTING SRS / REUSABLE RELEASE 0.3.0 / LARK BASE PROVISIONER VERIFIED / NEXT STEP IS PERSONAL GOLDEN-STACK APPLY.**

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

Detailed SRS remains the supporting specification for collaboration, Thread isolation, media, callback/reliability behavior, command variants, VIP handling, SLA labels and broadcast validation.

## Product release / exact verified code checkpoint

Product release: `0.3.0`

Last code-bearing verified SHA:
`e4c20229c6db15bbfbde51190bfe8899c1efb225`

GitHub CI:
- run `32551487092` / run #121
- job `96978858262`
- result: **SUCCESS**
- dependency audit: **0 vulnerabilities**
- TypeScript strict typecheck: **PASS**
- unit/contract tests: **42/42 PASS**
- Wrangler deploy dry-run bundle: **PASS**

The new tests include the machine-readable Lark Base contract and zero-mutation provisioner plan mode.

Any future source/config/test/migration change requires exact code HEAD CI again before runtime changes.

## Reusable product / Base contract

Exactly three Lark Base business tables:
1. `Customers`
2. `Chat_Tracking`
3. `Sales_Deals`

No Product or separate Quotation table. All field/API contracts use lower `snake_case`.

Canonical release/install assets:
- `deploy/product-manifest.json`
- `deploy/lark-base-contract.json`
- `scripts/provision-lark-base.mjs`
- `docs/lark-base-schema.md`
- `docs/lark-base-provisioning.md`
- `docs/setup.md`
- D1 migrations in manifest order
- deployment readiness validator + `/health`

### Lark Base provisioner — VERIFIED IN CI

Plan only, zero Lark mutations:

```bash
npm run lark:base:plan
```

Create the personal golden Base after Lark CLI user auth is ready:

```bash
npm run lark:base:apply
```

Resume a partially created Base without deleting successful state:

```bash
npm run lark:base:apply -- --base-token <base_token>
```

Provisioner behavior:
- uses explicit Lark **user** identity
- creates/reconciles only `Customers`, `Chat_Tracking`, `Sales_Deals`
- first field is the required primary field for each table
- creates bidirectional customer links/backlinks
- creates formula fields only after dependencies exist
- validates existing primary fields/types before resume mutation
- refuses an unrelated Base with unexpected tables
- verifies all expected fields/backlinks/formulas at the end
- outputs `LARK_BASE_APP_TOKEN` and the three table IDs for the existing Cloudflare Worker configuration
- does not create/delete a fourth business table and does not auto-rollback by destructive Base recreation

## Private prebuild → PM presentation handoff — LOCKED

The product is intentionally being completed **before the PM formally starts the work** so the real engineering/integration effort is known and difficult work is not done under the official delivery clock.

### Phase A — private golden/reference build now

Use:
- owner's personal Lark workspace / personal Lark Base
- owner-controlled Lark App/Bot and Sales Inbox
- owner's existing Cloudflare Worker/D1/R2/Queue/DLQ resources
- controlled reference/test LINE OA and PromptPay configuration

This is the private golden/reference installation, not a disposable DEV/UAT environment.

Do not put real customer production data or credentials into it.

### Phase B — when PM formally starts

The PM already uses the owner's Cloudflare, so **Cloudflare remains the same infrastructure** for the PM presentation phase.

The main change is Lark:
1. keep the same verified application release and Cloudflare Worker/D1/R2/Queue/DLQ
2. transfer Lark ownership/control if cleanly supported, otherwise create a fresh PM-controlled Lark Base/App/Bot/Sales Inbox from the same manifest/contracts
3. replace only Lark-specific app credentials, Base/table IDs, chat ID, verification/encryption values and changed resource identities
4. update the existing Worker secrets/vars to point to PM Lark
5. require `/health` ready and rerun the affected controlled E2E flows
6. PM then presents/demos from the PM-controlled Lark installation

This is **not** a Cloudflare migration and not DEV → PROD promotion. See `docs/pm-presentation-handoff.md`.

### Phase C — customer sale/approval

A sold customer receives the same verified product blueprint. Customer-specific values stay in configuration/secrets/bindings rather than a fork of the reusable business logic.

## Implemented code coverage

- LINE HMAC webhook verification, Queue normalization and retry/redelivery handling
- D1 idempotency, one active case per LINE user and atomic Case Claim
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

## Next work — do not add more feature code first

1. On the owner's Mac, run `npm run lark:base:plan` from this branch.
2. Ensure official `lark-cli` user authentication is valid (`lark-cli auth status --json --verify`).
3. Run `npm run lark:base:apply` once to create the personal golden Base.
4. Capture the returned Base app token + three table IDs.
5. Create/configure the owner-controlled Lark App/Bot and Sales Inbox.
6. Keep using the existing owner Cloudflare account/resources; apply D1 migrations in manifest order and configure Lark/LINE/PromptPay values.
7. Require `/health` HTTP 200 with `configuration.ready=true`.
8. Enable callbacks/webhook only after readiness is green.
9. Run the full controlled E2E in `docs/setup.md`.
10. Fix only real integration mismatches and rerun affected flows.

## Handoff read order

1. `AGENTS.md`
2. `docs/current-task.md`
3. `docs/requirements-authority.md`
4. `docs/pm-presentation-handoff.md`
5. `docs/customer-deployment-model.md`
6. `deploy/product-manifest.json`
7. `deploy/lark-base-contract.json`
8. `docs/lark-base-provisioning.md`
9. `docs/customer-srs-sow-2026-08-22.md`
10. `docs/customer-srs-gap-analysis.md`
11. `docs/schema-naming-convention.md`
12. `docs/lark-base-schema.md`
13. `docs/setup.md`
14. current PR #1 exact HEAD + CI evidence

Never describe the SRS as a later scope expansion. Never describe this as DEV → UAT → PROD. For PM presentation handoff, **Lark changes while Cloudflare remains the owner's existing shared infrastructure** unless an explicit later decision changes that.
