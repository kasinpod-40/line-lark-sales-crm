# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Current Status

**PRODUCT RELEASE 0.3.0 / PERSONAL GOLDEN BASE SCHEMA COMPLETE / PREMIUM UX APPLY IN PROGRESS / UX DELIVERY SPLIT INTO SERVER STRUCTURE+SETTINGS THEN BASE JS SDK VISIBLE-FIELDS / NEXT STEP IS RESUME CLI UX APPLY ON THE SAME BASE TO MATERIALIZE ALL 22 VIEWS + DASHBOARDS, THEN RUN THE EXISTING IN-BASE VISIBLE-FIELDS EXTENSION.**

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

## Live Lark UX compatibility — resolved delivery order

The repeated `Customers.🧠 AI Lead Intelligence` failure proved the current server `visible_fields` mutation lane is not reliable on the live golden Base: the endpoint can return without a fatal API error while the persisted View still remains with all fields visible.

A Base JS SDK fallback was then started immediately, but its first live preflight reported:

`Missing View: Chat_Tracking.💬 Case & Chat Timeline`

That error exposed an orchestration defect, not another Base defect: the earlier CLI apply had stopped on `Customers.🧠 AI Lead Intelligence` before it ever materialized the remaining `Chat_Tracking` / `Sales_Deals` curated Views. Therefore the in-Base visible-field runner correctly refused to mutate a View that did not yet exist.

The delivery model is now split by proven capability:

### Lane A — server CLI owns structure and persisted server-safe settings
`npm run lark:base:ux:apply -- --base-token <existing_base_token>` now:
- verifies the exact three-table completed schema
- creates/renames/prunes all 22 curated Views
- reconciles filters, groups and sorts
- creates/verifies both dashboards and all 23 blocks
- **does not call or final-verify server `visible_fields` at all**
- reports all 22 visible-field configurations as `BASE_JS_SDK_UI_REQUIRED`

This allows the CLI pass to finish the full View/Dashboard structure instead of dying before later Views exist.

### Lane B — in-Base JS SDK owns visible fields/order
After Lane A succeeds:

```bash
npm run lark:base:ux:visible-ui
```

Open the existing local Extension inside the same Base and click **Apply visible fields**. The runner uses the official Base JS SDK `getVisibleFieldIdList()` + `hideField()` + `showField()` path, keeps the primary field visible, and requires exact ordered readback across all 22 Views.

Do not run Lane B before Lane A has completed all 22 View resources.

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
`deffe9278bd667502e10c4eca00a0999881bcf4b`

GitHub CI:
- run `32567456121` / run #174
- job `97018063135`
- result: **SUCCESS**
- dependency audit: **0 vulnerabilities**
- TypeScript strict typecheck: **PASS**
- unit/contract tests: **69/69 PASS**
- Wrangler `4.125.0` deploy dry-run: **PASS**

Regression coverage now locks that the server UX provisioner never reconciles/final-verifies `visible_fields` and that plan/apply declare the Base JS SDK UI lane instead.

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

1. Stop the currently running visible-field local server if it is still open; keep the Extension definition in the Base.
2. Pull branch head containing verified code SHA `deffe9278bd667502e10c4eca00a0999881bcf4b` or a later docs-only commit containing it.
3. Resume `npm run lark:base:ux:apply -- --base-token <existing_base_token>` on the same golden Base and require the server pass to finish all 22 Views + 2 dashboards / 23 blocks with `visible_fields.status=BASE_JS_SDK_UI_REQUIRED`.
4. Start `npm run lark:base:ux:visible-ui`, reopen/refresh the existing Extension, click **Apply visible fields**, and require all 22 Views exact.
5. Apply the three locked table icons manually in Lark UI.
6. Visually inspect the 22 curated Views and both Dashboards.
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
