# Integration Setup / Controlled E2E Checklist

The application code is intended to be completed before the customer Base exists. Real LINE/Lark/Base verification begins only after provisioning the external resources below.

Requirements authority:
1. PM 5-function summary = latest executive/acceptance summary.
2. Full SRS/SOW = detailed requirements for the same scope.
3. Field/API naming = lower `snake_case`.

## 1. Lark Base

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

## 2. Lark App / Bot

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

Add the bot to the intended Sales Inbox group and store that group's chat ID in `LARK_SALES_INBOX_CHAT_ID`.

### Thread security behavior

- Human message inside a known Case Thread may bridge to the mapped LINE customer after the case is claimed.
- Case Owner remains the owner for Deal/KPI attribution and financial/campaign actions.
- Other human team members in the same Sales Inbox Thread may assist with customer-facing replies.
- Human messages typed in the Sales Inbox root chat are **never** sent to LINE. The bot posts an orange warning telling the user to use Reply in Thread.

## 3. LINE Messaging API

Webhook:

`https://<worker-host>/webhooks/line`

Configure:
- Channel Secret
- Channel Access Token
- webhook delivery/redelivery

The Worker validates `x-line-signature` before Queue mutation.

Supported current bridge behavior:

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

## 4. Cloudflare resources

Provision:

- Worker
- D1 database
- R2 bucket `line-lark-sales-crm-media`
- Queue `line-lark-sales-crm-events`
- DLQ `line-lark-sales-crm-events-dlq`
- Workers AI binding `AI` if AI inference is desired

Apply D1 migrations **once and in order** before traffic:

1. `migrations/0001_operational_state.sql`
2. `migrations/0002_srs_media_and_campaign_observability.sql`

The shared Queue carries both inbound LINE jobs and confirmed asynchronous CRM Campaign dispatch jobs. Campaign delivery therefore does not depend on a long Lark callback `waitUntil()` window.

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

## 6. Worker configuration

Secrets:

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LARK_APP_ID`
- `LARK_APP_SECRET`
- `LARK_VERIFICATION_TOKEN`
- `LARK_ENCRYPT_KEY` only if callback encryption is enabled
- `PROMPTPAY_TARGET`

Vars:

- `LARK_SALES_INBOX_CHAT_ID`
- `LARK_BASE_APP_TOKEN`
- `LARK_BASE_CUSTOMERS_TABLE_ID`
- `LARK_BASE_CHAT_TRACKING_TABLE_ID`
- `LARK_BASE_SALES_DEALS_TABLE_ID`
- `PROMPTPAY_TARGET_TYPE`
- `PUBLIC_BASE_URL`
- `COMPANY_NAME`
- `QUOTE_DEFAULT_VAT_RATE` default `7`
- `QR_TTL_SECONDS` default `604800`
- `MEDIA_TTL_SECONDS` default `604800`
- `VIP_GOLD_MIN_THB` — customer/business threshold; leave blank if not decided
- `VIP_DIAMOND_MIN_THB` — customer/business threshold; leave blank if not decided
- optional `AI_TEXT_MODEL`
- optional `AI_VISION_MODEL`

Bindings:

- `DB` = D1
- `MEDIA_BUCKET` = R2
- `LINE_EVENTS_QUEUE` = shared Queue producer
- `AI` = Workers AI, optional but recommended

Use `wrangler.jsonc.example` as template. Do not commit real secrets.

## 7. Controlled E2E order

Run in this order so each failure has a narrow root cause:

1. `/health` shows LINE, Lark, Base, PromptPay and media configured.
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

Do not call the system production-ready until this real controlled E2E has captured evidence.
