# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Current Status

**PRODUCT RELEASE 0.3.0 / PERSONAL GOLDEN BASE SCHEMA COMPLETE / PREMIUM UX LANE A COMPLETE / PREMIUM UX LANE B VISIBILITY MEMBERSHIP COMPLETE 22/22 / 7 VIEW ORDERS EXACT + 15 ORDER-ONLY DRIFTS ACCEPTED AS NON-BLOCKING / 0 BUSINESS-DATA MUTATIONS / NEXT STEP IS FINAL VISUAL CHECK (OPTIONAL TABLE ICON PASS) THEN OWNER APP/BOT/CLOUDFLARE READINESS AND CONTROLLED E2E.**

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

Latest code-bearing verified SHA:
`d3b0e81721927822446d27709c27fdecd3ed34f8`

GitHub CI:
- run `32569627647` / run #183
- job `97023147077`
- result: **SUCCESS**
- dependency audit: **0 vulnerabilities**
- TypeScript strict typecheck: **PASS**
- unit/contract tests: **72/72 PASS**
- Wrangler `4.125.0` deploy dry-run: **PASS**

No source/config/test/migration change was needed for the Lane B runtime pass or this acceptance decision; these are documentation/runtime-state updates only.

Any future source/config/test/migration change requires exact updated-head CI again before runtime mutation. Documentation-only commits may reference the verified code SHA above.

## Delivery model — locked

Phase A now:
- owner's personal Lark workspace/Base
- owner-controlled Lark App/Bot and `LINE Sales Inbox`
- owner's existing Cloudflare Worker/D1/R2/Queue/DLQ
- controlled reference/test LINE OA
- no real customer production credentials/business data in private reference Base

Phase B when PM formally starts:
- Cloudflare remains the same owner infrastructure
- change/transfer only Lark-controlled resources as required
- keep the same verified release/schema/migrations/business logic
- replace only Lark-specific credentials/resource IDs/configuration
- require `/health` ready and rerun affected E2E before PM presentation

This is not a Cloudflare migration and not DEV → PROD promotion.

Phase C customer sale:
- same verified product blueprint/release/schema/migrations/workflow
- customer-specific values are config/secrets/bindings
- no per-customer business-logic fork

## Next work

1. Stop the local `lark:base:ux:visible-ui` server; the visibility membership lane is complete and should not be rerun.
2. Do a quick visual inspection of all 22 curated Views and both Dashboards; column-order differences are accepted and non-blocking.
3. Optionally apply the preferred three sidebar table icons in Lark UI if the UI exposes a true icon control; preserve canonical table names exactly.
4. Configure the owner-controlled Internal App/Bot and central `LINE Sales Inbox`; keep Events/Callbacks disabled until Cloudflare configuration is complete.
5. Read fresh Cloudflare docs before any Cloudflare source/config change, then bind the existing Worker/D1/R2/Queue/DLQ installation-specific vars/secrets.
6. Require `/health` HTTP 200 with `configuration.ready=true` before enabling external callbacks.
7. Enable required LINE/Lark callbacks and run the locked controlled E2E matrix.
8. Do not mark `live-ready` / `reusable-ready` until controlled runtime evidence exists.

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
