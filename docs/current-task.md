# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Current Status

**PRODUCT RELEASE 0.3.0 / PERSONAL GOLDEN BASE SCHEMA COMPLETE / PREMIUM UX LANE A COMPLETE / ALL 22 VIEW VISIBILITY MEMBERSHIPS PROVEN CORRECT / 7 VIEW ORDERS EXACT + 15 ORDER-ONLY UI DRIFTS / BASE JS SDK RUNNER NOW HANDLES EXTENSION-FRAME TABLE-CONTEXT READINESS WITH BOUNDED CANONICAL TABLE RESOLUTION / NEXT STEP IS RESTART THE EXISTING LOCAL EXTENSION SERVER, RE-RUN VISIBLE-FIELD READBACK, THEN DO THE REMAINING MANUAL PRESENTATION ORDER + TABLE ICON PASS.**

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
- table icons remain a manual UI pass because the supported table API exposes no sidebar-icon setter

Lane A no longer calls or final-verifies the unreliable server `visible_fields` mutation endpoint.

## Premium UX Lane B — live visibility membership complete; order capability boundary proven

The first full in-Base JS SDK run completed all 22 Views and produced a crucial live distinction:
- 22 Views inspected
- **22/22 Views have the exact requested visible-field membership**
- 7/22 Views also have the exact requested order
- 15/22 Views differ only in column order
- 0 unsupported Views
- 0 table mutations
- 0 field-schema mutations
- 0 record mutations

The earlier runner incorrectly treated order-only drift as a visibility failure. It then hid/re-showed already-correct fields, but the order remained unchanged. The live evidence proves that `showField()` / `hideField()` control visibility membership, not arbitrary column position.

Current official Base JS SDK documentation confirms:
- `getFieldMetaList()` provides the View field order as readback
- `getVisibleFieldIdList()` provides visible membership/order readback
- `showField()` and `hideField()` mutate visibility
- there is no documented Grid View field-order mutation setter

Therefore the runner now has two separate correctness dimensions:
1. **Visibility membership** — automated and required for `ok=true`.
2. **Column order** — read and reported separately; order-only drift is `MANUAL_UI_PASS_REQUIRED`, not a failed visibility mutation.

The fixed runner:
- performs minimal membership reconciliation only (hide excess + show missing)
- never re-hides/re-shows a View just because its order differs
- reports `membership_views`, `ordered_views`, `order_manual_views`, `order_mismatches`
- returns a membership success when all requested visible fields are present and no extras remain
- preserves fail-closed behavior for a real membership mismatch or missing/unsupported resource

## Base JS SDK Extension-frame context readiness

After restarting the local Extension server, one live rerun returned `Missing Table: Customers` even though the same Base had already produced the complete 22-View evidence moments earlier. The old runner used a single eager `getTableMetaList()` snapshot and immediately converted a transient/reconnecting SDK frame into a false missing-table failure.

The runner now follows the documented canonical resolver path instead:
- each required business table is resolved with `base.getTableByName(<canonical_name>)`
- resolution is retried boundedly (8 reads with short backoff) before failure
- `getTableMetaList()` is no longer the correctness authority for the initial table lookup
- if resolution still fails, the error includes available table names, current selection table ID, active table name, and the last resolver error so a genuinely wrong Base context is distinguishable from SDK-frame readiness
- this path is read-only for Base/Table structure; it does not create, rename, delete, or mutate tables

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

Locked sidebar assignments:
- `Customers` → 👥
- `Chat_Tracking` → 💬
- `Sales_Deals` → 💰

Current supported Lark Base v3 table update / official CLI do not expose a sidebar-icon setter. Apply these three in Lark UI after automated UX apply. Do not prefix canonical table names with emoji.

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

Regression coverage locks both:
- visibility membership vs unsupported order-only drift
- canonical table resolution with bounded Base JS SDK context-readiness retries and actionable wrong-Base diagnostics

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

1. Stop the old local `lark:base:ux:visible-ui` server if it is still running, pull the branch head containing verified code SHA `d3b0e81721927822446d27709c27fdecd3ed34f8` (or a later docs-only commit containing it), then restart the same server.
2. Reopen/refresh the existing Extension from inside the golden Base and run **Apply visible fields** once. Require `ok=true`, `membership_views=22`, `failures=[]`; order-only differences must appear only under `order_mismatches` / `order_manual_views`.
3. If the Base context still cannot resolve after bounded retries, use the emitted `available_tables`, `selection_table_id`, and `active_table` diagnostics; do not recreate the Base.
4. Do not rerun visibility mutation to chase order-only differences. Apply the remaining View column order in the Lark UI because the documented SDK exposes no order setter.
5. Apply the three locked table icons manually in Lark UI.
6. Visually inspect all 22 curated Views and both Dashboards.
7. Keep Events/Callbacks disabled until Cloudflare configuration is complete and `/health` returns HTTP 200 with `configuration.ready=true`.
8. Configure secrets/vars, enable callbacks, then run controlled E2E.
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
