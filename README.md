# LINE × Lark Sales CRM

Reusable LINE-only Sales CRM for teams that want customers to stay in LINE OA while Sales works entirely inside Lark.

Current product release: **0.3.0**

## Core flow

`LINE OA → webhook → Cloudflare Queue → AI/CRM processing → Lark Sales Inbox Card → Claim Case → Reply in Thread ↔ LINE`

The same root Lark Card is updated through the case lifecycle. The Lark Thread is the conversation. Lark Base is the business CRM store. Cloudflare D1/Queues/R2 hold operational state, idempotency and expiring bridge media.

## Product / delivery model

We build one complete **golden/reference stack** for the product. There is no DEV/UAT/STAGING/PROD ladder for that implementation.

After the golden stack passes the controlled E2E, every sold customer receives a fresh installation of the **same verified product release** in customer-specific LINE/Lark/Cloudflare resources. Customer credentials, Base/table IDs, chat IDs, PromptPay target and Cloudflare resource identities are configuration — not source-code forks.

See:
- `docs/single-stack-delivery.md`
- `docs/customer-deployment-model.md`
- `deploy/product-manifest.json`
- `docs/setup.md`

## Customer-facing Base model

Exactly three tables for the current scope:
- `Customers`
- `Chat_Tracking`
- `Sales_Deals`

All field/API names use lower `snake_case`.

See `docs/lark-base-schema.md` before creating the Base.

## Implemented workflow code

- LINE signature verification, Queue ingestion and retry/redelivery handling
- LINE text/image/file/audio/location/sticker normalization with safe bridge mappings
- LINE profile/content download, push and multicast
- deterministic lead rules + optional Workers AI text classification
- optional Workers AI vision path for payment-slip/image analysis
- customer/case resolution and D1 idempotency
- Lark Schema 2.0 root Case Card and live in-place updates
- atomic `[🙋‍♂️ รับเคสนี้]`
- collaborative Reply-in-Thread → LINE bridge while keeping one Case Owner for KPI/Deal attribution
- strict root-chat isolation with visible warning
- inbound LINE messages/media → case Thread
- manual quotation form (up to 5 line items) → preview/confirm → `Sales_Deals` → LINE Flex
- persisted quote total → payment form → preview/confirm → PromptPay QR PNG → LINE
- `ปิดยอด 45000` / `ยอดเงิน 150000` confirmed Closed Won flow + customer Active Customer and configurable VIP recalculation
- close-case First Response SLA, separate Resolution timing and Sales Closed Won aggregate card
- `ยิงโปร vip` / `ยิงโปร retarget` / `บรอดแคสต์` → segment preview → confirmed asynchronous LINE multicast batches <=500 with retry/fallback state
- retry/idempotency state for webhook events, card actions and campaign batches
- reusable deployment validation that rejects missing bindings, obvious placeholder IDs, invalid HTTPS public URL, invalid PromptPay target and invalid VIP/VAT/TTL configuration before E2E
- `/health` returns HTTP 200 only when required runtime configuration is ready; otherwise HTTP 503 with safe issue codes/messages and no secret values

## Local / CI checks

```bash
npm install
npm run check
```

Local checks and GitHub CI are verification gates, not runtime environments. They do not replace the final controlled E2E.

## Golden/customer installation prerequisites

Do not enable real webhook/event traffic until the three Base tables, D1, R2, Queue/DLQ, LINE credentials, Lark app/event subscriptions, PromptPay target and public Worker URL are configured.

Use `deploy/product-manifest.json` as the machine-readable release/install contract and `docs/setup.md` as the controlled E2E checklist.
