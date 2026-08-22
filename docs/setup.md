# Final Stack Setup / Controlled E2E Checklist

This project has **one real integration stack only**. There is no DEV/UAT/STAGING/PROD ladder.

Local work and GitHub CI are verification gates. The resources below are created once as the final target, the controlled E2E runs directly on that same target, and the same resources are retained for operation after acceptance.

Read these first:
- `docs/single-stack-delivery.md`
- `docs/customer-deployment-model.md`
- `deploy/product-manifest.json`

Requirements authority:
1. PM 5-function summary = latest executive/acceptance summary.
2. Full SRS/SOW = detailed requirements for the same scope.
3. Field/API naming = lower `snake_case`.

## 0. Pre-flight before creating external resources

- exact code-bearing HEAD must have successful GitHub CI
- select one verified product release/SHA and matching `deploy/product-manifest.json`
- do not create a second Base/Worker for testing
- decide final names/IDs once
- prepare final secrets and PromptPay target
- keep LINE webhook and Lark event delivery disabled/disconnected until the final target is fully configured and `/health` is ready

## 1. Final Lark Base — create once

Create exactly the three tables from `docs/lark-base-schema.md`:

- `Customers`
- `Chat_Tracking`
- `Sales_Deals`

Then record:
- Base app token
- Customers table ID
- Chat_Tracking table ID
- Sales_Deals table ID

Do not add Product/Quotation/technical-state Base tables.

Important relation/formula setup:
- `Chat_Tracking.customer` → `Customers`
- `Sales_Deals.customer` → `Customers`
- backlinks `chat_history` and `deals`
- SLA formulas/fields per final schema
- Closed Won value + `total_spend_thb` rollup per final schema

This Base is the same Base used for controlled E2E and continued operation. Do not clone/promote data into another Base afterward.

## 2. Final Lark App / Bot

The app/bot must be able to:
- send/update interactive messages/cards in the Sales Inbox group
- receive `im.message.receive_v1`
- receive interactive-card action callbacks
- reply in Thread
- upload message images/files
- download message resources for image/file/audio bridging
- read user basic display name (optional; code has safe fallback)
- read/write the target Lark Base tables

Callback:
`https://<worker-host>/webhooks/lark`

Configure verification token. If callback encryption is enabled, also configure the encrypt key.

Add the bot to the final Sales Inbox group and store that group's chat ID in `LARK_SALES_INBOX_CHAT_ID`.

### Thread security behavior

- Human message inside a known Case Thread may bridge to the mapped LINE customer after the case is claimed.
- Case Owner remains the owner for Deal/KPI attribution and financial/campaign actions.
- Other human team members in the same Sales Inbox Thread may assist with customer-facing replies.
- Human messages typed in the Sales Inbox root chat are **never** sent to LINE. The bot posts an orange warning telling the user to use Reply in Thread.

## 3. Final LINE Messaging API channel

Webhook:
`https://<worker-host>/webhooks/line`

Configure:
- Channel Secret
- Channel Access Token
- webhook delivery/redelivery

The Worker validates `x-line-signature` before Queue mutation.

Do not enable the webhook until Worker, D1, R2, Queue, Lark App and Base IDs are configured and `/health` is HTTP 200.

Supported bridge behavior:

| Direction | Type | Behavior |
|---|---|---|
| LINE → Lark | text | Thread text |
| LINE → Lark | JPEG/PNG/image | Lark image; R2 fallback link when direct upload cannot be used |
| LINE → Lark | PDF/file | Lark file when within safe bridge size; explicit warning for oversized file |
| LINE → Lark | audio | Lark message file/audio representation |
| LINE → Lark | location | text + map link |
| LINE → Lark | sticker | safe textual representation |
| Lark → LINE | text | native LINE text |
| Lark → LINE | JPEG/PNG | native LINE image when compatible; R2 link fallback otherwise |
| Lark → LINE | PDF/file | HTTPS R2 download link because LINE Messaging API has no general outbound file message type |
| Lark → LINE | compatible MP3/M4A audio | native LINE audio; R2 link fallback for incompatible formats such as Opus |
| Lark → LINE | location with coordinates | native LINE location |
| Lark → LINE | sticker | textual fallback because Lark/LINE sticker IDs/resources are not interoperable |

These fallback mappings are intentional platform-compatibility behavior, not silent data loss.

## 4. Final Cloudflare resources — create once

Provision the resources listed by `deploy/product-manifest.json`:
- Worker
- D1 database
- R2 bucket
- Queue
- DLQ
- Workers AI binding `AI` if AI inference is desired

Apply D1 migrations **once and exactly in manifest order**:
1. `migrations/0001_operational_state.sql`
2. `migrations/0002_srs_media_and_campaign_observability.sql`

The shared Queue carries inbound LINE jobs and confirmed asynchronous CRM Campaign dispatch jobs. Campaign delivery therefore does not depend on a long Lark callback `waitUntil()` window.

R2 is used only for expiring bridge media assets. D1 `media_assets` metadata authorizes `/assets/media/<token>` access until expiry.

Text AI defaults to `@cf/meta/llama-3.1-8b-instruct-fast`. Vision defaults to `@cf/meta/llama-3.2-11b-vision-instruct`. Text falls back to deterministic rules if Workers AI is unavailable; image analysis falls back to a safe generic image state.

## 5. PromptPay / public assets

Configure PromptPay target type:
- `phone`
- `national_id`
- `ewallet`

`PUBLIC_BASE_URL` must be the final public HTTPS Worker base URL because LINE fetches:
- PromptPay QR: `/assets/qr/<token>.png`
- bridge media: `/assets/media/<token>`

The readiness validator rejects an invalid PromptPay target/type pair before E2E.

## 6. Final Worker configuration

Use `deploy/product-manifest.json` as the canonical list of required/optional values.

Required secrets include:
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LARK_APP_ID`
- `LARK_APP_SECRET`
- `LARK_VERIFICATION_TOKEN`
- `PROMPTPAY_TARGET`

Optional secret:
- `LARK_ENCRYPT_KEY` only if callback encryption is enabled

Required vars include:
- `LARK_SALES_INBOX_CHAT_ID`
- `LARK_BASE_APP_TOKEN`
- `LARK_BASE_CUSTOMERS_TABLE_ID`
- `LARK_BASE_CHAT_TRACKING_TABLE_ID`
- `LARK_BASE_SALES_DEALS_TABLE_ID`
- `PUBLIC_BASE_URL`

Optional/default vars:
- `PROMPTPAY_TARGET_TYPE`
- `COMPANY_NAME`
- `QUOTE_DEFAULT_VAT_RATE` default `7`
- `QR_TTL_SECONDS` default `604800`
- `MEDIA_TTL_SECONDS` default `604800`
- `VIP_GOLD_MIN_THB` — business threshold; leave blank if not decided
- `VIP_DIAMOND_MIN_THB` — business threshold; leave blank if not decided
- `AI_TEXT_MODEL`
- `AI_VISION_MODEL`

Bindings:
- `DB` = D1
- `MEDIA_BUCKET` = R2
- `LINE_EVENTS_QUEUE` = shared Queue producer
- `AI` = Workers AI, optional but recommended

Use `wrangler.jsonc.example` as template. Do not commit real secrets.

## 7. Deployment readiness gate

Before enabling external callbacks, call:

`GET https://<worker-host>/health`

Expected ready state:
- HTTP `200`
- `ok: true`
- `configuration.ready: true`
- required readiness checks true

Blocking configuration produces HTTP `503` with safe `code`, `key`, and `message` fields. The endpoint does **not** return secret values.

The validator blocks common installation mistakes including:
- missing required secrets/vars/bindings
- obvious example/placeholder Lark/Base/public URL values
- non-HTTPS or malformed `PUBLIC_BASE_URL`
- PromptPay target/type mismatch
- invalid VAT/TTL values
- invalid/reversed VIP thresholds

Workers AI and VIP thresholds may intentionally be absent; those appear as warnings because deterministic AI fallback / VIP-preserve behavior exists.

After `/health` is ready:
1. configure/enable Lark callback/event delivery
2. configure/enable LINE webhook
3. immediately run the controlled E2E below

There is no later environment promotion step.

## 8. Controlled E2E on the same final stack

Run in this order so each failure has a narrow root cause:

1. `/health` is HTTP 200 with `configuration.ready=true`.
2. LINE text → one blue root Case Card + Thread message.
3. Burst several first messages from one LINE user → still exactly one active Case/root Card.
4. Two Sales attempt Claim → one atomic winner; same Card turns green.
5. Owner replies in Thread → LINE receives it.
6. Specialist/Manager replies in the same Thread → LINE receives it; MESSAGE audit shows actual responder while Case Owner remains unchanged.
7. Human types in Sales Inbox root chat → **no LINE outbound** + orange Thread warning.
8. Test LINE → Lark and Lark → LINE image, PDF/file, audio, location and sticker/fallback behavior.
9. Quote form → Preview → Confirm → verify `Sales_Deals` snapshot exists **before** LINE Flex delivery and Customer becomes `📄 Quotation Sent`.
10. QR → amount prefilled from persisted Deal → Preview → Confirm → verify high-resolution PromptPay PNG + `payment_status`.
11. Customer sends payment-slip image → AI/payment state surfaces in Thread/Card.
12. Test `ปิดยอด 45000` and `ยอดเงิน 150000`; confirm before Closed Won.
13. In PAYMENT context test bare `30000` → confirmation only, never immediate mutation.
14. Verify Closed Won → `deal_value_thb`, `Closed Won 🏆`, Customer `🏆 Active Customer`, Payment Confirmation, and configured VIP threshold behavior.
15. Close Case → same Card grey/report-only; verify First Response SLA, <=5m label, Resolution separately, Sales cumulative amount/deal count.
16. `ยิงโปร vip`, `ยิงโปร retarget`, `บรอดแคสต์` → Preview/Confirm → Queue dispatch → batches <=500 → retry/fallback state; verify invalid LINE IDs are excluded.
17. Retry/redelivery tests: LINE webhook, Queue, Card Action, outbound retry-key 409, Campaign batches.
18. Verify no root-chat/customer cross-route leakage under concurrent test traffic.

## 9. If a controlled E2E step fails

Do not create a DEV/UAT clone and do not rebuild the Base from scratch.

- capture the exact failing request/state/readback
- diagnose the root cause
- make the smallest code/config/schema correction
- require CI success for any code change
- rerun the affected flow on this same final stack
- preserve successful state unless rollback is actually required

When all controlled E2E steps pass, this same stack becomes `live-ready` and `reusable-ready` and remains the operating/reference system.
