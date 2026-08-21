# Integration Setup / First Test Checklist

The codebase is designed to be completed before the customer Base exists. Real end-to-end verification starts only after the resources below are provisioned.

## 1. Lark Base

Create exactly the three tables in `docs/lark-base-schema.md`, then record:

- Base app token
- Customers table ID
- Chat_Tracking table ID
- Sales_Deals table ID

Set them in Worker secrets/vars as described below.

## 2. Lark App

The app/bot must be able to:

- send and update messages/cards in the Sales Inbox group
- receive message events (`im.message.receive_v1`)
- receive interactive-card actions (`card.action.trigger`)
- upload message images
- read a user's basic display name (optional; code falls back to open_id suffix if Contact permission is unavailable)
- read/write the target Base tables

Callback URL:

`https://<worker-host>/webhooks/lark`

Configure verification token. If callback encryption is enabled, also set the encrypt key.

Add the bot to the intended Lark Sales Inbox group and record the chat ID.

## 3. LINE Messaging API

Webhook URL:

`https://<worker-host>/webhooks/line`

Configure:

- Channel Secret
- Channel Access Token
- webhook delivery/redelivery as appropriate

The Worker verifies `x-line-signature` before accepting events.

## 4. Cloudflare resources

Provision:

- Worker
- D1 database
- queue `line-lark-sales-crm-events`
- DLQ `line-lark-sales-crm-events-dlq`
- Workers AI binding `AI` if AI inference is desired

Apply `migrations/0001_operational_state.sql` to D1 before receiving traffic.

The vision model path defaults to `@cf/meta/llama-3.2-11b-vision-instruct`; if the provider requires model-license acceptance, accept it before testing image/slip analysis. Text AI defaults to `@cf/meta/llama-3.1-8b-instruct-fast`. If AI binding/model is unavailable, text classification falls back to deterministic rules; image analysis falls back to generic image state.

## 5. PromptPay / public QR

Configure a PromptPay target and type:

- `phone` (Thai 10-digit mobile)
- `national_id` (13 digits)
- `ewallet`

`PUBLIC_BASE_URL` must be the public HTTPS Worker base URL because LINE fetches QR images from `/assets/qr/<token>.png`.

## 6. Required Worker strings/bindings

Secrets:

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LARK_APP_ID`
- `LARK_APP_SECRET`
- `LARK_VERIFICATION_TOKEN`
- `LARK_ENCRYPT_KEY` (only when encryption is enabled)
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
- `QUOTE_DEFAULT_VAT_RATE` (default 7)
- `QR_TTL_SECONDS` (default 604800)
- optional `AI_TEXT_MODEL`
- optional `AI_VISION_MODEL`

Bindings:

- `DB` = D1
- `LINE_EVENTS_QUEUE` = Queue producer
- `AI` = Workers AI (optional but recommended)

## 7. Controlled E2E order

1. Health endpoint shows required systems configured.
2. LINE text creates blue root Case Card and a Thread message.
3. Two Sales attempt claim; only one must win atomically.
4. Owner replies in Thread; customer receives LINE; other Sales reply is blocked.
5. Quote form → preview → confirm; verify Sales_Deals saved before LINE Flex send.
6. QR action loads persisted quote amount → preview → confirm; verify 1024px PNG and LINE delivery.
7. Customer sends image/slip; verify Thread image + AI classification path.
8. `ปิดยอด 45000` → confirm → Closed Won + Active Customer + payment confirmation.
9. Close case → verify first-response/resolution metrics and Sales aggregate on same root Card.
10. VIP/retarget campaign → preview count → confirm; verify batching/idempotency without duplicate sends.
11. Retry/redelivery tests for LINE webhook, Queue, card actions and campaign batches.

Do not call the system production-ready until this controlled E2E has evidence.
