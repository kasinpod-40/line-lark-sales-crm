# LINE × Lark Sales CRM

LINE-only Sales CRM for teams that want customers to stay in LINE OA while Sales works entirely inside Lark.

## Core flow

`LINE OA → webhook → Cloudflare Queue → AI/CRM processing → Lark Sales Inbox Card → Claim Case → Reply in Thread ↔ LINE`

The same root Lark Card is updated through the case lifecycle. The Lark Thread is the conversation. Lark Base is the business CRM store. Cloudflare D1/Queues hold operational state and idempotency.

## Customer-facing Base model

Exactly three tables for the current scope:

- `Customers`
- `Chat_Tracking`
- `Sales_Deals`

See `docs/lark-base-schema.md` before creating the Base.

## Implemented workflow code

- LINE signature verification, text/image/sticker normalization and queue ingestion
- LINE profile/content download, push and multicast
- deterministic lead rules + optional Workers AI text classification
- optional Workers AI vision path for payment-slip/image analysis
- customer/case resolution and D1 idempotency
- Lark root Case Card and live in-place updates
- atomic `[🙋‍♂️ รับเคสนี้]`
- Reply-in-Thread → LINE text bridge
- inbound LINE text/image → case Thread
- manual quotation form (up to 5 line items) → preview/confirm → `Sales_Deals` → LINE Flex
- persisted quote total → payment form → preview/confirm → PromptPay QR PNG → LINE
- `ปิดยอด 45000` confirmed Closed Won flow + customer Active Customer/lifetime value recalculation
- close-case SLA and Sales closed-won aggregate card
- `ยิงโปร vip` / `ยิงโปร retarget` form → segment preview → confirmed LINE multicast in batches of 500
- retry/idempotency state for webhook events, card actions and campaign batches

## Local checks

```bash
npm install
npm run check
```

## Deployment prerequisites

Do not deploy until the three Base tables, D1, queues, LINE credentials, Lark app/event subscriptions, PromptPay target and public Worker URL are configured. See `docs/setup.md`.
