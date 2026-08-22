# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Current Status

**PRODUCT RELEASE 0.3.0 / PERSONAL GOLDEN BASE SCHEMA COMPLETE / PREMIUM UX APPLY IN PROGRESS / SERVER `visible_fields` PATH DECLARED UNRELIABLE ON THE LIVE GOLDEN BASE / BASE JS SDK VISIBLE-FIELD RUNNER VERIFIED IN CI / NEXT STEP IS APPLY THAT UI RUNNER, THEN RESUME UX APPLY ON THE SAME BASE.**

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

CLI UX apply remains resume-safe and never recreates the Base or business tables:

```bash
npm run lark:base:ux:apply -- --base-token <existing_base_token>
```

## Live Lark UX compatibility — current conclusion

The repeated `Customers.🧠 AI Lead Intelligence` failure is no longer treated as a parser/readback problem.

Live evidence now proves:
- the requested subset is stable and valid
- the concrete Table/View addressing and readback are correct
- `+view-set-visible-fields` can return without a fatal API error while the persisted View still remains with all fields visible
- repeated retries across name/ID payload variants did not persist that View subset
- official current CLI E2E coverage explicitly lacks deterministic live View workflows

Therefore **do not keep rerunning the same server visible-field mutation path** on the golden Base.

The recovery lane now reuses the already-proven architecture family from the Social MKT Base workstream: run inside Lark Base with the official Base JS SDK. Current official Grid View documentation exposes:
- `getVisibleFieldIdList()`
- `hideField(fieldId | fieldId[])`
- `showField(fieldId | fieldId[])`

The new runner:
- reads the same `deploy/lark-base-ux-contract.json`
- never stores concrete Base/Table/View IDs in source
- mutates View presentation only
- does not mutate Tables, Field schema or Records
- keeps the primary field visible
- hides current non-primary fields and shows desired fields one-by-one in contract order
- reads back the ordered visible field IDs and requires exact equality
- fails closed on missing/duplicate Tables, Fields or Views

Run it locally with:

```bash
npm install --ignore-scripts
npm run lark:base:ux:visible-ui
```

Then open the printed local URL from **Lark Base → Add script** and click **Apply visible fields**. Only after that runner returns `ok=true` should the normal CLI UX apply resume for the remaining filters/groups/sorts/dashboards.

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
`6fba85e7adce16e733aaaf12cb784a6a133ebdc6`

GitHub CI:
- run `32566707903` / run #170
- job `97016268670`
- result: **SUCCESS**
- dependency audit: **0 vulnerabilities**
- TypeScript strict typecheck: **PASS**
- unit/contract tests: **67/67 PASS**
- Wrangler `4.125.0` deploy dry-run: **PASS**

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

1. Pull branch head containing verified code SHA `6fba85e7adce16e733aaaf12cb784a6a133ebdc6` or a later docs-only commit containing it.
2. Run the Base JS SDK visible-field UI runner on the same personal golden Base and require `ok=true`.
3. Resume `npm run lark:base:ux:apply -- --base-token <existing_base_token>`.
4. Verify all 22 curated Views and both Dashboards with no leftover default/localized Views.
5. Apply the three locked table icons manually in Lark UI.
6. Keep Events/Callbacks disabled until Cloudflare configuration is complete and `/health` returns HTTP 200 with `configuration.ready=true`.
7. Configure secrets/vars, enable callbacks, then run controlled E2E.
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
