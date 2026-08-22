# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Current Status

**PRODUCT RELEASE 0.3.0 / PERSONAL GOLDEN BASE SCHEMA COMPLETE / PREMIUM UX LANE A COMPLETE / PREMIUM UX LANE B VISIBILITY MEMBERSHIP COMPLETE 22/22 / 7 VIEW ORDERS EXACT + 15 ORDER-ONLY DRIFTS ACCEPTED AS NON-BLOCKING / DEDICATED CLOUDFLARE D1 + QUEUE + DLQ CREATED / D1 MIGRATIONS 2 OF 2 APPLIED AND VERIFIED / R2 BLOCKED ONLY BY ACCOUNT ENTITLEMENT 10042 / WORKER NOT YET DEPLOYED / NEXT STEP IS ENABLE R2, CREATE THE DEDICATED MEDIA BUCKET, COMPLETE INSTALL-SPECIFIC WRANGLER CONFIG + LARK APP/BOT/SALES INBOX, THEN DEPLOY AND REQUIRE `/health` READY BEFORE CALLBACKS.**

There is no DEV/UAT/STAGING/PROD ladder for this product build. Local/CI are verification gates only.

## Requirements authority — locked

1. Full customer SRS/SOW existed first.
2. PM later sent the concise five-function summary and linked back to the SRS.
3. PM summary is the latest executive acceptance view; the full SRS remains the detailed supporting specification unless explicitly contradicted.

PM acceptance view:
1. LINE inbound → blue Case Card + AI intent/lead quality → atomic Claim Case → same card green with owner.
2. Quote and PromptPay QR sales tools with preview/confirm.
3. Smart Close → `Sales_Deals` → Active Customer.
4. Close Case → executive summary including SLA/response and Sales closed revenue/deal count.
5. VIP/retarget broadcast commands from Lark Base segmentation.

Never describe the SRS as a later scope expansion.

## Reusable business contract

Exactly three Lark Base business tables:
- `Customers`
- `Chat_Tracking`
- `Sales_Deals`

All API field names are lower `snake_case`. No Product table and no separate Quotation table.

Canonical assets:
- `deploy/product-manifest.json`
- `deploy/lark-base-contract.json`
- `scripts/provision-lark-base.mjs`
- `deploy/lark-base-ux-contract.json`
- `scripts/provision-lark-base-ux.mjs`
- `scripts/lark-base-visible-fields-ui-server.mjs`
- `scripts/lark-base-visible-fields-ui.browser.js`
- `scripts/lark-cli-idempotency.mjs`
- `scripts/lark-cli-resource-list.mjs`
- `scripts/lark-eventual-reconcile.mjs`

## Personal golden Base — schema complete

The owner manually created the Base shell and the deterministic schema provisioner reconciled it successfully without recreating the Base.

Confirmed:
- `Customers` reused
- `Chat_Tracking` created
- `Sales_Deals` created
- required fields, links/backlinks and deferred formulas verified
- final schema apply returned `ok=true`
- concrete personal Base/table IDs remain installation config and are not committed

## Premium UX contract

The supplied customer demo is only a presentation reference. The golden product is intentionally richer:
- 22 curated Views across the three tables
- intentional Thai/English business labels with emoji icons
- default/localized Views reconciled away
- explicit visible fields, filters, groups and sorts
- Customer Journey / Case Lifecycle / Sales Pipeline Kanban coverage
- 2 dashboards / 23 blocks:
  - `🚀 Executive CRM Command Center`
  - `⚡ Sales Ops & SLA Control Room`

## Premium UX Lane A — live complete

The server CLI structure/settings lane completed successfully on the existing golden Base with no Base recreation:
- `ok=true`
- 22 expected Views
- 6 Views created in the final resume
- 1 View renamed
- 0 Views deleted in the final resume
- View properties: 14 changed / 31 unchanged / 0 no-op recovered
- 22 visible-field configs intentionally deferred to the in-Base JS SDK lane
- 45 verification reads
- 2 dashboards created
- 23 dashboard blocks created
- table icons remain a UI-only presentation detail because the supported table API exposes no sidebar-icon setter

Lane A no longer calls or final-verifies the unreliable server `visible_fields` mutation endpoint.

## Premium UX Lane B — live visibility membership complete

The final in-Base JS SDK write/readback pass completed successfully on the same golden Base:
- `ok=true`
- `expected_views=22`
- `membership_views=22`
- `ordered_views=7`
- `order_manual_views=15`
- `mutation_views=0` on the final verification pass
- `unsupported_views=0`
- `base_context_table_reads=3`
- `failures=[]`
- table mutations: 0
- field-schema mutations: 0
- record mutations: 0

This is the authoritative runtime evidence that **all 22 curated Views have the exact requested visible-field membership**. The remaining 15 differences are order-only presentation drift.

The live evidence confirms that `showField()` / `hideField()` control visibility membership but do not provide an arbitrary field-order setter. Current official Base JS SDK documentation exposes ordered readback (`getFieldMetaList`, `getVisibleFieldIdList`) plus show/hide controls, but no documented Grid View column-order mutation setter.

### Column-order acceptance decision — locked

The owner explicitly accepted the current column order and does not require manual reordering of the remaining 15 Views.

Therefore:
- **Visibility membership — COMPLETE / automated / 22 of 22 pass.**
- **Column order — 7 exact / 15 order-only drifts ACCEPTED AS NON-BLOCKING.**
- No manual reorder work is required.
- Do not rerun the visibility mutation to chase order-only differences.
- Do not block App/Bot/Cloudflare readiness or controlled E2E on column order.
- The UX contract keeps the preferred order as a presentation reference only; it is not a runtime/business-correctness gate.

## Base table naming / icon incident — resolved

One Extension run correctly diagnosed that the visible table names had temporarily become emoji-prefixed names (`👥 Customers`, `💬 Chat_Tracking`, `💰 Sales_Deals`). Those emoji prefixes were part of the actual table names, not separate sidebar icons, and therefore violated the canonical three-table contract.

The canonical contract remains:
- `Customers`
- `Chat_Tracking`
- `Sales_Deals`

Do not prefix canonical table names with emoji. Sidebar table icons are optional presentation-only UI polish and are not a runtime blocker.

## Dedicated Cloudflare resources — locked

The owner explicitly requires every Cloudflare resource for this product to be dedicated to this project. Do not reuse or bind BNK, legacy CRM, or Social MKT resources.

Dedicated resource names:
- Worker: `line-lark-sales-crm`
- D1: `line-lark-sales-crm`
- R2: `line-lark-sales-crm-media`
- Queue: `line-lark-sales-crm-events`
- DLQ: `line-lark-sales-crm-events-dlq`

Existing resources with names beginning `bnk-`, `crm-`, or `social-mkt-` are out of scope and must remain untouched.

## Cloudflare runtime provisioning — live state

Verified on the owner's Cloudflare account:
- dedicated D1 `line-lark-sales-crm` created successfully in APAC
- dedicated Queue `line-lark-sales-crm-events` created successfully
- dedicated DLQ `line-lark-sales-crm-events-dlq` created successfully
- Queue/DLQ currently have no producers/consumers because the project Worker has not been deployed yet
- Worker `line-lark-sales-crm` does not yet exist; this is intentional until bindings/secrets/readiness config are complete
- R2 API returns `10042` / not entitled; account-level R2 must be enabled before `line-lark-sales-crm-media` can be created

The local install-specific `wrangler.jsonc` is Git-ignored. It currently binds the dedicated D1 and Queue/DLQ so migrations can target the correct project resources without committing installation IDs.

### D1 migration milestone — complete

The dedicated D1 was empty before migration except for Cloudflare's `_cf_KV` table.

Migration apply completed successfully in canonical manifest order:
1. `0001_operational_state.sql` — success
2. `0002_srs_media_and_campaign_observability.sql` — success

Post-apply `wrangler d1 migrations list ... --remote` returned `No migrations to apply!`.

Verified remote tables now include:
- `_cf_KV`
- `action_dedupe`
- `campaign_batches`
- `case_routes`
- `d1_migrations`
- `event_dedupe`
- `interaction_drafts`
- `media_assets`
- `qr_assets`
- `sqlite_sequence`

A pre-apply migration-list request returned Cloudflare code `7403`, but the authoritative apply on the same target succeeded, the post-apply migration list is clean, and direct schema readback confirms the expected tables. No rollback or re-apply is required.

External callbacks remain disabled until `/health` is HTTP 200 with `configuration.ready=true`.

## Live filter readback arity normalization

During Lane A, `Chat_Tracking.🟢 SLA Fast` reached a semantically correct persisted filter but final verification rejected it because Lark read back unary `non_empty` as:

`["first_response_seconds", "non_empty", null]`

while the deterministic contract uses:

`["first_response_seconds", "non_empty"]`

Those forms are semantically identical. The shared View matcher canonicalizes only the unary `empty` / `non_empty` operators by dropping a trailing `null` before comparison. Binary/ternary operators are not weakened.

## Terminal operator-safety rule — locked

**Never instruct the owner to run `set -e` / `set -euo pipefail` directly in the interactive macOS Terminal shell.**

Reason: a non-zero child process would exit the interactive shell and produce `[Process completed]`.

## Table icons

Preferred sidebar assignments:
- `Customers` → 👥
- `Chat_Tracking` → 💬
- `Sales_Deals` → 💰

Current supported Lark Base v3 table update / official CLI do not expose a sidebar-icon setter. These icons are optional presentation polish and must not be implemented by prefixing canonical table names with emoji.

## Latest verification checkpoint

Latest code/config-bearing verified SHA:
`a2f652565548b164c8c17496e3b2471c93426921`

GitHub CI:
- run `32570641153` / run #187
- job `97025500916`
- result: **SUCCESS**
- dependency audit: **0 vulnerabilities**
- TypeScript strict typecheck: **PASS**
- unit/contract tests: **72/72 PASS**
- Wrangler `4.125.0` deploy dry-run: **PASS**

Cloudflare D1/Queue/DLQ creation and D1 migration application are runtime provisioning milestones, not source/config/test/migration-file changes. The current-task update that records them is documentation-only.

Any future source/config/test/migration-file change requires exact updated-head CI again before runtime mutation. Documentation-only commits may reference the verified code SHA above.

## Delivery model — locked

Phase A now:
- owner's personal Lark workspace/Base
- owner-controlled Lark App/Bot and `LINE Sales Inbox`
- dedicated project-specific Cloudflare Worker/D1/R2/Queue/DLQ in the owner's existing Cloudflare account
- controlled reference/test LINE OA
- no real customer production credentials/business data in private reference Base

Phase B when PM formally starts:
- Cloudflare account ownership remains the owner's infrastructure unless the commercial agreement explicitly changes it
- use the same verified release and the same dedicated product resource pattern
- change/transfer only Lark-controlled resources as required
- replace only Lark-specific credentials/resource IDs/configuration
- require `/health` ready and rerun affected E2E before PM presentation

This is not a DEV → PROD promotion.

Phase C customer sale:
- same verified product blueprint/release/schema/migrations/workflow
- customer-specific values are config/secrets/bindings
- no per-customer business-logic fork
- customer installations must not reuse unrelated project resources

## Next work

1. Enable R2 at the Cloudflare account level, then create only the dedicated bucket `line-lark-sales-crm-media`; do not recreate D1/Queue/DLQ.
2. Add the dedicated `MEDIA_BUCKET` R2 binding and optional `AI` binding to the local untracked `wrangler.jsonc`.
3. Configure/verify the owner-controlled Internal App/Bot and central `LINE Sales Inbox`; keep Events/Callbacks disabled until Cloudflare configuration is complete.
4. Complete local installation vars for the existing golden Base and Sales Inbox.
5. Put the six required secrets with Wrangler without committing their values; add `LARK_ENCRYPT_KEY` only if callback encryption is enabled.
6. Deploy the dedicated Worker `line-lark-sales-crm` for the first time with D1/R2/Queue/DLQ bindings.
7. Require `/health` HTTP 200 with `configuration.ready=true` before enabling external callbacks.
8. Enable required LINE/Lark callbacks and run the locked controlled E2E matrix.
9. Do not mark `live-ready` / `reusable-ready` until controlled runtime evidence exists.

## Handoff read order

1. `AGENTS.md`
2. `docs/current-task.md`
3. `docs/requirements-authority.md`
4. `docs/pm-presentation-handoff.md`
5. `docs/customer-deployment-model.md`
6. `deploy/product-manifest.json`
7. `deploy/lark-base-contract.json`
8. `deploy/lark-base-ux-contract.json`
9. `docs/lark-base-provisioning.md`
10. `docs/lark-base-ux.md`
11. `docs/customer-srs-sow-2026-08-22.md`
12. `docs/customer-srs-gap-analysis.md`
13. `docs/schema-naming-convention.md`
14. `docs/lark-base-schema.md`
15. `docs/setup.md`
16. current PR #1 exact HEAD + CI evidence
