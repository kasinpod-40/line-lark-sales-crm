# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Current Status

**PRODUCT RELEASE 0.3.0 / PERSONAL GOLDEN BASE SCHEMA COMPLETE / PREMIUM UX APPLY IN PROGRESS / CONCRETE TABLE+VIEW ID MUTATION PATH VERIFIED / NEXT STEP IS RESUME UX APPLY ON THE SAME BASE.**

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
- `scripts/lark-cli-idempotency.mjs`
- `scripts/lark-cli-resource-list.mjs`
- `scripts/lark-eventual-reconcile.mjs`
- `docs/lark-base-schema.md`
- `docs/lark-base-provisioning.md`
- `docs/lark-base-ux.md`

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

UX apply command:

```bash
npm run lark:base:ux:apply -- --base-token <existing_base_token>
```

The UX apply is resume-safe and never recreates the Base or business tables.

## Live Lark compatibility incidents — fixed in code so far

### 1. persisted-state no-op
Lark can return `no operation produced` when a requested mutation already matches persisted state. Known no-op responses are recoverable instead of fatal.

### 2. nested Select option misclassified as a Field
A generic recursive parser incorrectly promoted Select options such as `🔥 Hot Lead` into field resources. Resource parsing now reads only the official list collections and field lookup iterates only schema-contract fields.

### 3. asynchronous read visibility
Lark Base writes can become visible asynchronously. The runner no longer assumes immediate read-after-write consistency. Final acceptance uses bounded eventual-consistency polling/backoff, including View and Dashboard resource visibility.

### 4. `visible_fields` readback identity
Live target output proved `+view-get-visible-fields` returns canonical field **names**, not `fld...` IDs. The runner now keeps the expected visible-field state in canonical name form.

### 5. `group` readback identity
Live target output also proved `+view-get-group` resolves persisted field references to canonical field **names**. Readback verification keeps names for `visible_fields`, `group`, and `sort`, while tolerating wrapper differences and alternate ID-shaped responses.

### 6. write identity differs from readback identity
Official CLI mutation tests use concrete `fld...` IDs for `visible_fields`, `group`, and `sort`, while live getters resolve back to field names. Mutation and readback representations are now intentionally separate.

### 7. view-name addressing on property endpoints — latest live evidence
A repeated `🧠 AI Lead Intelligence` mismatch showed the desired field subset still was not applied even after mutation payloads used field IDs. The remaining identity bug was in the resource path itself: the provisioner was still passing the human View **name** to `--view-id` for property GET/PUT operations and, after creating a View, it even discarded the returned concrete View ID by storing `{ id: "" }` locally.

Official current CLI flags describe View references as ID or name, but the low-level property shortcut directly places the provided `view-id` value into `/views/:view_id/...`. For deterministic live mutation we must not rely on name addressing for those property endpoints.

Fix verified:
- schema preflight resolves and requires concrete `tbl...` IDs for all three business tables
- View list/create/rename/delete/property read/property write all use concrete current `vew...` IDs
- newly-created View metadata retains the actual returned ID instead of replacing it with an empty placeholder
- final verification refreshes the live View list and resolves every curated View name back to its current concrete ID before reading properties
- dashboard/block existence checks also require concrete IDs before continuing
- regression coverage prevents reintroducing name-based property mutation or the empty-ID placeholder

These incidents are provisioner compatibility defects, not Base corruption and not user setup errors.

## Terminal operator-safety rule — locked

**Never instruct the owner to run `set -e` / `set -euo pipefail` directly in the interactive macOS Terminal shell.**

Reason: when a child command returns non-zero, `set -e` exits the interactive shell itself, which causes macOS Terminal to show `[Process completed]` and forces the owner to open a new shell/window.

Future command blocks must either:
- omit `set -e` entirely, or
- use a disposable subshell `( set -euo pipefail; ... )` so only the subshell exits and the interactive Terminal remains usable.

## Table icons

Locked sidebar assignments:
- `Customers` → 👥
- `Chat_Tracking` → 💬
- `Sales_Deals` → 💰

Current supported Lark Base v3 table update / official CLI do not expose a sidebar-icon setter. Apply these three in Lark UI after automated UX apply. Do not prefix canonical table names with emoji.

## Latest verification checkpoint

Latest code-bearing verified SHA:
`8426bf7202940eea6b89148cf33d043f025a3a8d`

GitHub CI:
- run `32565648487` / run #162
- job `97013779001`
- result: **SUCCESS**
- dependency audit: **0 vulnerabilities**
- TypeScript strict typecheck: **PASS**
- unit/contract tests: **65/65 PASS**
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

1. Pull current branch head containing verified code SHA `8426bf7202940eea6b89148cf33d043f025a3a8d` or a later docs-only commit containing it.
2. Resume `npm run lark:base:ux:apply -- --base-token <existing_base_token>` against the same golden Base.
3. Verify all 22 curated Views and both Dashboards with no leftover default/localized Views.
4. Apply the three locked table icons manually in Lark UI.
5. Keep Events/Callbacks disabled until Cloudflare configuration is complete and `/health` returns HTTP 200 with `configuration.ready=true`.
6. Configure secrets/vars, enable callbacks, then run controlled E2E.
7. Do not mark `live-ready` / `reusable-ready` until controlled runtime evidence exists.

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
