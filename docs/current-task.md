# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-23 (ICT)

## Current Status

**PRODUCT RELEASE 0.3.0 / PERSONAL GOLDEN BASE SCHEMA COMPLETE / PREMIUM UX 22/22 MEMBERSHIP COMPLETE / DEDICATED CLOUDFLARE D1 + QUEUE + DLQ CREATED / D1 MIGRATIONS 2 OF 2 APPLIED / LARK-FIRST MEDIA ARCHITECTURE COMPLETE / R2 NOT REQUIRED / WORKER FIRST DEPLOY COMPLETE / `/health` HTTP 200 + `configuration.ready=true` / LINE WEBHOOK CUT OVER AND VERIFIED / LARK ENCRYPTED CALLBACK ROOT CAUSE FIXED WITH WORKERS WEB CRYPTO + CI #199 SUCCESS / PATCH AWAITS LIVE WORKER DEPLOY / CONTROLLED E2E NOT YET COMPLETE.**

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

Dedicated runtime resources:
- Worker: `line-lark-sales-crm`
- D1: `line-lark-sales-crm`
- Queue: `line-lark-sales-crm-events`
- DLQ: `line-lark-sales-crm-events-dlq`
- Workers AI binding: enabled on current golden deployment

**R2 is not required by the current product architecture.** Do not create or bind an R2 bucket merely because an earlier draft used one.

## Cloudflare runtime provisioning — live state

Verified live state:
- dedicated D1 created successfully in APAC
- dedicated Queue created successfully
- dedicated DLQ created successfully
- D1 migrations fully applied
- Worker first deployment completed at `https://line-lark-sales-crm.kasinpod40.workers.dev`
- `/health` returned HTTP 200, `ok=true`, `configuration.ready=true`
- readiness true for LINE, Lark, Lark Base, PromptPay placeholder, operational state, media and Workers AI
- VIP thresholds intentionally unset; current warning is non-blocking
- PromptPay target remains demo/placeholder and must not be used for real payment acceptance
- no R2 binding is present or required

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

## LINE callback — live

The golden/reference LINE OA webhook has been changed from the legacy `omnichannel-commerce-crm` endpoint to:

`https://line-lark-sales-crm.kasinpod40.workers.dev/webhooks/line`

LINE Developers verification returned **Success**. `Use webhook` and `Webhook redelivery` are enabled.

This is a cutover: the LINE Messaging API channel has one webhook destination, so the old Worker no longer receives this OA's webhook events directly.

## Lark encrypted callback incident — root cause fixed, live deploy pending

When switching Lark Event Configuration to `Send notifications to developer's server`, the console returned:

`Challenge code didn't get response`

Runtime evidence established the exact failure chain:
- Lark POST reaches `https://line-lark-sales-crm.kasinpod40.workers.dev/webhooks/lark`
- safe diagnostic showed `encrypted=true`, body size 206 bytes
- decrypt failed immediately with `ReferenceError` before a challenge could be returned
- plaintext challenge probes were already HTTP 200, so URL/DNS/Cloudflare ingress were not the blocker

Root cause: `decryptLarkPayload()` dynamically imported `@larksuiteoapi/node-sdk` and used its Node-oriented `AESCipher`; that path is not safe in the Cloudflare Workers runtime used by this product.

Minimal reusable fix:
- callback decryption now uses native Web Crypto only
- derive AES key as SHA-256 of Lark Encrypt Key
- base64-decode encrypted payload
- first 16 bytes are the IV
- decrypt remaining bytes with AES-256-CBC
- no Node SDK import occurs on the callback decrypt path
- normal event/card verification-token enforcement remains unchanged
- regression test encrypts a Lark-shaped URL-verification payload using the same protocol and verifies encrypted challenge decrypt + echo

Exact verified code/test HEAD:
`ccfcc9c196121dd00c9375a48cf1ae17ea05418e`

GitHub CI:
- run `32592036251` / run #199
- job `97077259162`
- result: **SUCCESS**
- full `npm run check`: **PASS**

The live Worker still needs this verified patch deployed before retrying Lark Request URL verification.

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

1. Sync Mac to exact verified code/test HEAD `ccfcc9c196121dd00c9375a48cf1ae17ea05418e` (documentation-only handoff commits may follow it).
2. Deploy the existing golden Worker with the already-configured local `wrangler.jsonc` and existing Cloudflare secrets; do not recreate D1/Queue/DLQ and do not rerun migrations.
3. Recheck `/health` remains HTTP 200 with `configuration.ready=true`.
4. Keep `wrangler tail` open and retry Lark Event Configuration Request URL `https://line-lark-sales-crm.kasinpod40.workers.dev/webhooks/lark` once. Expected diagnostic: encrypted callback parses successfully and `challenge_echo` is logged.
5. After URL verification passes, add `im.message.receive_v1` and configure Card callback/action URL on the same Worker route.
6. Run controlled E2E beginning with LINE text → one blue Case Card + Thread in `LINE Sales Inbox`.
7. Do not mark `live-ready` / `reusable-ready` until the controlled E2E passes.
8. Replace demo PromptPay configuration before any real payment/QR use.

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
