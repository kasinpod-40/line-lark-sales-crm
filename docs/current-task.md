# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Current Status

**PRODUCT RELEASE 0.3.0 / PERSONAL GOLDEN BASE SCHEMA CREATED SUCCESSFULLY / POLISHED VIEW + DASHBOARD UX CONTRACT VERIFIED / NEXT STEP IS APPLY UX TO THE EXISTING BASE.**

There is no DEV/UAT/STAGING/PROD ladder for this product build. Local work and GitHub CI are verification gates only.

## Requirements authority — locked

1. Full customer SRS/SOW existed first.
2. PM later sent the concise five-function summary and linked back to the SRS.
3. PM summary is the latest executive acceptance view; the earlier full SRS remains the detailed supporting specification unless explicitly contradicted.

PM acceptance view:
1. New LINE inbound → blue Case Card + AI intent/lead quality → atomic Claim Case → same card turns green with owner.
2. Quote and PromptPay QR sales tools with preview/confirm.
3. Smart Close → `Sales_Deals` → Active Customer.
4. Close Case → executive summary including SLA/response and Sales cumulative closed revenue/deal count.
5. VIP / retarget broadcast commands from Lark Base segmentation.

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
- `docs/lark-base-schema.md`
- `docs/lark-base-provisioning.md`
- `docs/lark-base-ux.md`
- D1 migrations in manifest order
- deployment readiness validator + `/health`

## Personal golden Base — schema milestone complete

The owner created the personal Lark Base shell manually and the deterministic schema provisioner successfully reconciled it to the full `lark_base_golden_contract_v1` contract.

Confirmed runtime schema state:
- `Customers` exists and was reused rather than recreated
- `Chat_Tracking` created
- `Sales_Deals` created
- required fields, links/backlinks and deferred formulas verified
- final apply returned `ok=true`
- concrete personal Base/table IDs remain installation configuration and are not committed to source

Two real integration mismatches were fixed before this success:
1. current `lark-cli auth status --json --verify` is a status object rather than an `{ok:true}` shortcut envelope
2. current Base v3 table/field objects expose identifier `id`; resume now accepts both modern `id` and legacy `table_id` / `field_id`

## Golden Base UX / presentation contract

The supplied customer demo was inspected as a presentation reference. It contains the same three business-table concepts but a much thinner field/view/reporting surface. The golden product must be more complete and presentation-ready without copying the demo's limitations.

New deterministic UX contract:
- **22 curated views** across the three tables
- all curated View names are intentional Thai/English business labels with emoji icons
- platform/default localized View names are reconciled away
- filters, grouping, sorting and visible-field order are explicitly configured
- Kanban views cover Customer Journey, Case Lifecycle and Sales Pipeline
- **2 dashboards / 23 blocks**:
  - `🚀 Executive CRM Command Center`
  - `⚡ Sales Ops & SLA Control Room`
- Executive reporting covers revenue, won deals, average won deal, active/VIP customers, hot leads, revenue by Sales, pipeline, customer stage, lead quality and revenue trend
- Operations reporting covers open/resolved cases, response/resolution time, case lifecycle, SLA distribution, Sales workload, message type and inbound/outbound activity

Commands:

```bash
npm run lark:base:ux:plan
npm run lark:base:ux:apply -- --base-token <existing_base_token>
```

The UX apply is resume-safe and refuses to run until the completed exact-three-table schema exists. It never recreates the Base or business tables.

### Table icons

Locked sidebar icon assignments:
- `Customers` → 👥
- `Chat_Tracking` → 💬
- `Sales_Deals` → 💰

Current supported Lark Base v3 table update / official `lark-cli` do not expose a table/sidebar icon setter. Therefore these three icons are a one-time Lark UI pass after automated UX apply. Do not prefix canonical table names with emoji because runtime table names are locked.

## Latest verification checkpoint

Verified branch head containing the UX contract/provisioner:
`d16b3d771454158782d8c31de91eaa31a0c7937e`

GitHub CI:
- run `32561880393` / run #133
- job `97004609184`
- result: **SUCCESS**
- dependency audit: **0 vulnerabilities**
- TypeScript strict typecheck: **PASS**
- unit/contract tests: **50/50 PASS**
- Wrangler `4.125.0` deploy dry-run bundle: **PASS**

Any future source/config/test/migration change requires exact updated-head CI again before runtime mutation.

## Private prebuild → PM presentation handoff — locked

Phase A now:
- owner's personal Lark workspace/Base
- owner-controlled Lark App/Bot and `LINE Sales Inbox`
- owner's existing Cloudflare Worker/D1/R2/Queue/DLQ
- controlled reference/test LINE OA
- no real customer production credentials/business data in the private reference Base

Phase B when PM formally starts:
- Cloudflare stays on the same owner infrastructure because PM already uses it
- change/transfer only the Lark-controlled resources as required
- keep the same verified application release, schema, migrations and Cloudflare logic
- replace only Lark-specific credentials/resource IDs/configuration
- require `/health` ready and rerun affected E2E before presentation

This is not a Cloudflare migration and not DEV → PROD promotion.

Phase C customer sale:
- same verified product blueprint/release/schema/migrations/workflow
- customer-specific values remain config/secrets/bindings
- no per-customer business-logic fork

## Implemented product coverage

- LINE HMAC webhook verification → Queue → Worker
- D1 idempotency, one active case per LINE user, atomic first-winner claim
- LINE customer/profile sync
- AI/rule intent, lead quality and guidance
- Lark Card 2.0 blue/green/grey lifecycle on the same root card
- central Sales Inbox + one root Card/Thread per case
- collaborative human Thread replies with owner attribution preserved
- root-chat isolation and warning
- actual responder audit rows
- text/image/file/PDF/audio/location/sticker-safe bridge mappings
- R2 expiring media + D1 media metadata
- Quote → Preview/Confirm → `Sales_Deals` → LINE Flex
- PromptPay QR Preview/Confirm → LINE
- Smart Close + direct Closed Won snapshot
- Payment confirmation → Active Customer + config-driven VIP
- First Response SLA <=5m rule and separate Resolution metric
- Sales Closed Won aggregate on resolved Card
- VIP/retarget broadcast Preview/Confirm → Queue → <=500 multicast batches + retry/fallback
- strict LINE user-ID filtering
- deployment validator and safe `/health` readiness gate

## Next work

1. Pull the current branch head containing the verified UX provisioner.
2. Apply `npm run lark:base:ux:apply -- --base-token <existing_base_token>` to the **existing** personal golden Base; do not create another Base.
3. Verify all 22 curated views and both dashboards materialize without leftover default/localized views.
4. Apply the three locked Table sidebar icons manually in Lark UI only because the supported API has no icon setter.
5. Keep Events/Callbacks disabled until the existing Cloudflare stack is configured and `/health` returns HTTP 200 with `configuration.ready=true`.
6. Configure owner Cloudflare resources/secrets/vars, then enable LINE/Lark callbacks.
7. Run the full controlled E2E in `docs/setup.md`; fix only real integration mismatches and rerun affected flows.
8. Do not mark `live-ready` / `reusable-ready` until controlled E2E runtime evidence exists.

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

Never describe this as DEV → UAT → PROD. For PM presentation handoff, Lark changes while Cloudflare remains the owner's existing shared infrastructure unless an explicit later decision changes that.
