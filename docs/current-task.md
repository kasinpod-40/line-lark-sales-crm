# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Current Status

**PRODUCT RELEASE 0.3.0 / PERSONAL GOLDEN BASE SCHEMA COMPLETE / PREMIUM UX 22/22 MEMBERSHIP COMPLETE / DEDICATED CLOUDFLARE D1 + QUEUE + DLQ CREATED / D1 MIGRATIONS 2 OF 2 APPLIED / LARK-FIRST MEDIA ARCHITECTURE COMPLETE IN CODE / R2 NO LONGER REQUIRED / EXACT CODE HEAD CI SUCCESS 74/74 / WORKER NOT YET DEPLOYED / CALLBACKS REMAIN DISABLED / NEXT STEP IS LOCAL WRANGLER + LARK APP/BOT/SALES INBOX CONFIG, THEN FIRST DEPLOY AND `/health`.**

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

## Personal golden Base — current authority

Latest uploaded `.base` snapshot is the current runtime/presentation authority. It confirms exactly three business tables, 22 curated Views, 2 dashboards and 23 dashboard blocks.

The latest snapshot currently displays the three table names with emoji prefixes:
- `👥 Customers`
- `💬 Chat_Tracking`
- `💰 Sales_Deals`

Runtime repositories are configured by concrete table IDs, so this presentation-name drift is not assumed to break runtime. Do not rerun the completed UX lanes and do not rename/delete/recreate tables merely to satisfy an older name-only expectation. Provisioning/name-based tooling must be assessed separately if it is run again.

## Premium UX — complete for runtime acceptance

Lane A server structure/settings apply completed successfully. Lane B final in-Base JS SDK verification returned:
- expected Views: 22
- visible-field membership: 22/22
- exact order: 7
- order-only drift: 15
- unsupported: 0
- failures: []
- final mutation pass: 0

Owner accepted the 15 order-only differences as non-blocking. No manual reorder is required and Lane B must not be rerun merely to chase order.

## Dedicated Cloudflare resources — locked

All Cloudflare resources for this product must be dedicated to this project. Never bind BNK, legacy CRM or Social MKT resources.

Dedicated runtime resources now required:
- Worker: `line-lark-sales-crm`
- D1: `line-lark-sales-crm`
- Queue: `line-lark-sales-crm-events`
- DLQ: `line-lark-sales-crm-events-dlq`
- Workers AI binding: optional

**R2 is not required by the current product architecture.** Do not create or bind an R2 bucket merely because an earlier draft used one.

## Cloudflare runtime provisioning — live state

Verified live state:
- dedicated D1 created successfully in APAC
- dedicated Queue created successfully
- dedicated DLQ created successfully
- D1 migrations are fully applied
- Queue/DLQ have no producer/consumer yet because Worker has not been deployed
- Worker does not yet exist
- account-level R2 returns code `10042`, but this is no longer a deployment blocker because R2 has been removed from the required architecture

The local install-specific `wrangler.jsonc` is Git-ignored. It must retain only this project's D1 + Queue/DLQ + optional AI bindings; any local R2 stanza from an earlier draft should be removed.

### D1 migration milestone — complete

Applied in canonical order:
1. `0001_operational_state.sql` — success
2. `0002_srs_media_and_campaign_observability.sql` — success

Post-apply migration list returned `No migrations to apply!`.

Verified remote tables include:
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

Do not reapply or rewrite the already-live migration files.

## Lark-first media architecture — locked

The customer-facing system is Lark-first and D1 remains invisible technical state.

Media behavior:
- LINE → Lark: Worker downloads permitted LINE media and uploads it directly into the Case Thread. Lark stores the message resource. There is no R2 fallback copy.
- If native Lark image upload fails, image delivery may fall back to a Lark file message; if Lark delivery still fails, Queue retry/DLQ handles the failure rather than silently persisting a second object copy elsewhere.
- Lark → LINE: Worker reads the Lark message resource, registers an expiring D1 `media_assets` authorization record, and sends LINE a public HTTPS `/assets/media/<token>` URL when LINE requires a fetchable media URL or file link.
- `/assets/media/<token>` resolves the D1 authorization, then fetches the resource from Lark on demand with the Internal App. File bytes remain authoritative in Lark.
- `MEDIA_TTL_SECONDS` remains as the expiring proxy-token lifetime; it no longer describes R2 object retention.
- D1 remains the authority for atomic claim, webhook/action dedupe, route state, drafts, QR metadata, campaign state and expiring media-proxy metadata.

## Exact code verification — complete

Latest code/config/test-bearing verified SHA:
`fc9d33e81281640d232f893bbf5927c84ab247e7`

GitHub CI:
- run `32583000911` / run #192
- job `97055062250`
- result: **SUCCESS**
- dependencies: 121 packages added / 122 audited / **0 vulnerabilities**
- TypeScript strict typecheck: **PASS**
- unit/contract tests: **74/74 PASS**
- Wrangler `4.125.0` deploy dry-run: **PASS**
- dry-run upload: 6144.07 KiB / gzip 536.71 KiB

Verified source changes:
- `Env` no longer requires `MEDIA_BUCKET`
- readiness no longer blocks on R2
- `MediaAssetService` stores Lark resource locators in D1 instead of media bytes in R2
- public media route proxies authorized Lark resources
- LINE → Lark no longer uses R2 fallback
- Lark → LINE uses the Lark-backed proxy URL
- canonical manifest and Wrangler example contain no R2 binding
- tests cover no-R2 readiness and Lark media-locator encoding

No Worker deployment or external callback mutation was performed by this code change.

## Terminal operator-safety rule — locked

Never instruct the owner to run `set -e` / `set -euo pipefail` directly in the interactive macOS Terminal shell. A non-zero child process can terminate the interactive shell and produce `[Process completed]`.

## Delivery model — locked

Phase A now:
- owner's personal Lark workspace/Base
- owner-controlled Lark Internal App/Bot and `LINE Sales Inbox`
- dedicated project Worker/D1/Queue/DLQ in owner's Cloudflare account
- Lark message resources as media authority
- controlled reference/test LINE OA
- no real customer production credentials/business data in the private reference installation

PM/customer installations use the same verified release and resource pattern. Customer-specific credentials/resource IDs remain config only; no per-customer business-logic fork.

## Next work

1. Update local untracked `wrangler.jsonc` to match `wrangler.jsonc.example`: remove any R2 binding and retain dedicated D1 + Queue/DLQ + optional AI.
2. Configure/verify owner-controlled Internal App/Bot and central `LINE Sales Inbox`; keep callbacks disabled.
3. Complete local Lark Base/Sales Inbox vars.
4. Put the six required secrets with Wrangler locally; never paste secret values into chat or source. Add `LARK_ENCRYPT_KEY` only if callback encryption is enabled.
5. Deploy dedicated Worker `line-lark-sales-crm` for the first time.
6. Require `/health` HTTP 200 with `configuration.ready=true` before enabling LINE/Lark callbacks.
7. Run controlled E2E including Lark-backed image/file/audio proxy behavior and confirm there is no R2 dependency.
8. Do not mark `live-ready` / `reusable-ready` until the controlled E2E passes.

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
