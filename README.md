# LINE × Lark Sales CRM

LINE-only Sales CRM for teams that want customers to stay in LINE OA while Sales works entirely inside Lark.

## Core flow

`LINE OA → webhook → Cloudflare Queue → AI/CRM processing → Lark Sales Inbox Card → Claim Case → Reply in Thread ↔ LINE`

The same root Lark Card is updated through the case lifecycle. The Lark Thread is the conversation. Lark Base is the business CRM store. Cloudflare D1/Queues/R2 hold operational state, idempotency and expiring bridge media.

## Delivery model

This project uses **one final integration stack only**. There is no DEV/UAT/STAGING/PROD environment ladder.

Local development and GitHub CI are verification gates. After code gates are green, the real Lark Base, LINE OA, Lark App/Bot and Cloudflare resources are provisioned once. The controlled E2E is executed on that same final stack, and the same stack is retained for operation after acceptance.

See `docs/single-stack-delivery.md` and `docs/setup.md`.

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

## Local checks

```bash
npm install
npm run check
```

Local checks are not a DEV/UAT environment and do not replace the final controlled E2E.

## Final-stack prerequisites

Do not enable real webhook/event traffic until the three Base tables, D1, R2, Queue/DLQ, LINE credentials, Lark app/event subscriptions, PromptPay target and public Worker URL are configured. See `docs/setup.md`.
