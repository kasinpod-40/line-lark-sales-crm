# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Current Status

**PRODUCT RELEASE 0.3.0 / PERSONAL GOLDEN BASE SCHEMA COMPLETE / PREMIUM UX CONTRACT COMPLETE / LARK LIST-PARSER + IDEMPOTENCY + EVENTUAL-CONSISTENCY RECOVERY VERIFIED / NEXT STEP IS RESUME UX APPLY ON THE EXISTING BASE.**

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
- `scripts/lark-cli-idempotency.mjs`
- `scripts/lark-cli-resource-list.mjs`
- `scripts/lark-eventual-reconcile.mjs`
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
- final schema apply returned `ok=true`
- concrete personal Base/table IDs remain installation configuration and are not committed to source

Two real schema integration mismatches were fixed before this success:
1. current `lark-cli auth status --json --verify` is a status object rather than an `{ok:true}` shortcut envelope
2. current Base v3 table/field objects expose identifier `id`; resume accepts both modern `id` and legacy `table_id` / `field_id`

## Golden Base UX / presentation contract

The supplied customer demo was inspected as a presentation reference. It contains the same three business-table concepts but a much thinner field/view/reporting surface. The golden product must be more complete and presentation-ready without copying the demo's limitations.

Deterministic UX contract:
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

### Real UX integration incident 1 — no-op mutation / readback identity mismatch — CLOSED IN CODE

The first real UX apply stopped at `Customers.🧠 AI Lead Intelligence` while setting visible fields because current Lark Base can return `no operation produced` as a non-zero API/CLI result when the requested persisted state is already present.

The deeper compatibility issue was that the UX contract intentionally uses stable field **names**, while current Lark view property getters return field **IDs** for `visible_fields`, grouping and sorting. Comparing the two forms directly is not a valid idempotency check.

Fix verified:
- read the current view property before each write
- map contract field names → current target Base field IDs for readback comparison
- skip writes whose persisted state already matches
- recognize the official persisted-state `no operation produced` response only on idempotent view-property mutations
- preserve array order for visible fields and sort/group definitions
- resume from the partially applied Base; no Base/table recreation and no rollback of successful view work

### Real UX integration incident 2 — nested select option misclassified as field — CLOSED IN CODE

A later resume stopped with:

```text
Field Customers.🔥 Hot Lead exists but current Lark CLI returned no id/field_id
```

`🔥 Hot Lead` is a Single Select option value inside an actual field; it is not a Base field. Root cause was the UX provisioner's generic recursive object crawler: it walked into nested field properties/options and treated every nested object with a `name` as a resource.

Fix verified:
- list parsing now selects only the official resource collection returned by the current CLI (`tables[]`, `fields[]`, `views[]`, or the nearest dashboard/block `items[]` collection)
- nested Select options and nested metadata are never promoted into field/table/view/dashboard resource maps
- field-ID lookup iterates only schema-contract field names
- regression tests cover real-shaped Select options
- the same collection-aware parser is reused for tables, fields, views, dashboards and dashboard blocks

### Real UX integration incident 3 — immediate read-after-write against asynchronous Lark state — CLOSED IN CODE

The next resume stopped with:

```text
Readback mismatch after setting visible_fields Customers.👥 ลูกค้าทั้งหมด
```

Official current Lark Base guidance states that many Table/View updates are applied asynchronously and an immediate read can still return the previous state. The provisioner was incorrectly treating that temporary stale read as a permanent failure.

Fix verified:
- successful writes are no longer followed by an immediate fatal readback
- reconciliation reads once before a write to skip already-matching state, then performs the write without assuming instant visibility
- final acceptance uses bounded eventual-consistency polling with backoff until Lark state converges
- View create/rename/delete visibility is also polled rather than assumed immediate
- Dashboard and Dashboard Block creation use the same eventual-consistency wait path proactively, preventing the same failure class later in the run
- no-op responses remain recoverable, but final persisted state is still verified before the table is accepted
- final mismatch errors now include bounded diagnostic expected/actual payloads only after retries are exhausted
- regression tests prove no immediate stale read occurs after write and that stale reads can converge across retries

These UX failures were provisioner compatibility defects, not Base corruption and not user setup errors.

### Table icons

Locked sidebar icon assignments:
- `Customers` → 👥
- `Chat_Tracking` → 💬
- `Sales_Deals` → 💰

Current supported Lark Base v3 table update / official `lark-cli` do not expose a table/sidebar icon setter. Therefore these three icons are a one-time Lark UI pass after automated UX apply. Do not prefix canonical table names with emoji because runtime table names are locked.

## Latest verification checkpoint

Latest code-bearing verified SHA:
`66f0765e3f5f82ce2de289abc2fa1a8e4223fed4`

GitHub CI:
- run `32563597101` / run #149
- job `97008842509`
- result: **SUCCESS**
- dependency audit: **0 vulnerabilities**
- TypeScript strict typecheck: **PASS**
- unit/contract tests: **60/60 PASS**
- Wrangler `4.125.0` deploy dry-run bundle: **PASS**

Any future source/config/test/migration change requires exact updated-head CI again before runtime mutation. Documentation-only commits may point back to the exact verified code SHA above.

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

1. Pull the branch containing verified code SHA `66f0765e3f5f82ce2de289abc2fa1a8e4223fed4` or a later documentation-only head containing it.
2. Rerun `npm run lark:base:ux:apply -- --base-token <existing_base_token>` against the **same existing personal golden Base**. The run must resume/skip already-persisted state and tolerate asynchronous Lark read visibility.
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
