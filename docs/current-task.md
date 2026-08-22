# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Current Status

**PRODUCT CODE-COMPLETE FOR PM 5 FUNCTIONS + SUPPORTING SRS / REUSABLE RELEASE 0.3.0 / LARK BASE RESUME CURRENT-ID SHAPE FIX VERIFIED / NEXT STEP IS RESUME THE EXISTING PERSONAL GOLDEN BASE.**

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
`74b48331dc47d0e625effc4c9837fc6efa6689c8`

GitHub CI:
- run `32559186156` / run #126
- job `96998033433`
- result: **SUCCESS**
- dependency audit: **0 vulnerabilities**
- TypeScript strict typecheck: **PASS**
- unit/contract tests: **45/45 PASS**
- Wrangler `4.125.0` deploy dry-run bundle: **PASS**

The provisioner regression coverage now includes:
- current official `lark-cli auth status --json --verify` status shape
- unverified user refusal before Base mutation
- current Base v3 table/field objects that expose their resource identifier as `id`

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

Resume a manually created or partially provisioned Base without deleting successful state:

```bash
npm run lark:base:apply -- --base-token <base_token>
```

Provisioner behavior:
- uses explicit Lark **user** identity
- validates current official auth status using `identity=user` and `verified=true`; auth status itself is not a shortcut success envelope and does not require `ok=true`
- keeps `ok=true` mandatory for actual Lark Base shortcut mutations/reads handled by the provisioner
- accepts both legacy `table_id` / `field_id` and current Base v3 `id` identifiers from Lark CLI responses
- creates/reconciles only `Customers`, `Chat_Tracking`, `Sales_Deals`
- first field is the required primary field for each table
- creates bidirectional customer links/backlinks
- creates formula fields only after dependencies exist
- validates existing primary fields/types before resume mutation
- refuses an unrelated Base with unexpected tables
- verifies all expected fields/backlinks/formulas at the end
- outputs `LARK_BASE_APP_TOKEN` and the three table IDs for the existing Cloudflare Worker configuration
- does not create/delete a fourth business table and does not auto-rollback by destructive Base recreation

### Real Lark CLI integration incident 1 — CLOSED IN CODE

First personal golden Base apply reached the user-auth preflight and stopped with:

```text
Lark user auth status returned JSON without ok=true
```

No Base mutation occurred because the failure was before `+base-create`.

Root cause: current official `lark-cli` (`1.0.89` during this run) returns `auth status --json --verify` as a status object containing fields such as `identity` and `verified`, not the `{ ok: true, ... }` success envelope used by Base shortcut commands.

Fix at `27c1bdb42c758abb8fe735be56a824e1ba4cb7c1`:
- auth preflight accepts the official status object
- requires effective `identity` to be `user`
- requires `verified=true`
- preserves `ok=true` enforcement for Base shortcut commands
- regression tests cover both verified-current-status acceptance and unverified-user refusal before Base mutation

### Real Lark CLI integration incident 2 — CLOSED IN CODE

The owner manually created the final personal Base shell and an existing `Customers` table. Resume then stopped with a duplicate-name refusal for `Customers`.

Root cause:
- current Lark Base v3 / current official Lark CLI table and field objects expose their identifier as `id`
- the provisioner parser only recognized `table_id` and `field_id`
- therefore the existing `Customers` table was invisible to reconciliation and the provisioner attempted a duplicate create
- Lark rejected the duplicate before any duplicate table was created

Fix at `74b48331dc47d0e625effc4c9837fc6efa6689c8`:
- table discovery accepts `table_id` or current `id`
- field discovery accepts `field_id` or current `id`
- resume regression proves an existing `Customers` + `customer_id` using current `id` is recognized and the next create target is `Chat_Tracking`, not `Customers`
- exact code HEAD CI run #126 passed 45/45 tests and Wrangler dry-run

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

1. On the owner's Mac, pull exact verified code SHA `74b48331dc47d0e625effc4c9837fc6efa6689c8` or the later docs-only head containing it.
2. Resume the **existing manually created personal Base** with `npm run lark:base:apply -- --base-token <existing_base_token>`; do not create another Base.
3. Reconcile `Customers`, then create `Chat_Tracking` and `Sales_Deals`, links/backlinks and deferred formulas.
4. Capture the final three table IDs for Worker configuration.
5. Create the required operational Views and Dashboard; apply meaningful icons in the Lark UI pass rather than changing canonical table names.
6. Keep the owner-controlled CRM App/Bot; Events/Callbacks remain disabled until the Worker readiness gate is green.
7. Keep using the existing owner Cloudflare account/resources; apply D1 migrations in manifest order and configure Lark/LINE/PromptPay values.
8. Require `/health` HTTP 200 with `configuration.ready=true`.
9. Enable callbacks/webhook only after readiness is green.
10. Run the full controlled E2E in `docs/setup.md` and fix only real integration mismatches.

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
