# CRM → LINE/Lark extraction map

Source repository: `kasinpod-40/omnichannel-commerce-crm`

## Reused directly

- `src/providers/line/line.provider.ts`
  - LINE webhook HMAC verification
  - LINE profile lookup
  - LINE message-content download
- `src/routes/line/webhook.route.ts`
  - normalize LINE message events
  - accept text/image/sticker
  - preserve `webhook_event_id` and redelivery state
  - enqueue only supported direct-user events
- `src/queues/line-event.types.ts`
- `src/queues/line-event.producer.ts`
- AI lead-analysis contract: intent, buyer intent, customer stage, lead score, hot lead, summary, confidence

## Reuse by extraction, not copy-all

The old `process-incoming-message.usecase.ts` is intentionally NOT copied wholesale. It imports commerce-specific Order, Payment, Pipeline, Lost Sale and notification orchestration. The new repo keeps only a narrow `IncomingMessageProcessor` boundary so the LINE/Lark sales workflow can reuse AI/customer logic without inheriting Shopee/Lazada/stock/order coupling.

The old LINE consumer is also not copied wholesale yet because its image path uploads into the old Lark Bitable attachment model. The new consumer will target the new Lark Case Card + Thread bridge contract instead.

## Explicitly excluded

- Marketplace adapters and routes
- Shopee
- Lazada
- TikTok Shop / marketplace code
- inventory/stock routing
- old commerce-order materialization
- marketplace polling and OAuth

## New destination architecture

`LINE OA → webhook → LINE queue → LINE consumer → AI/customer resolver → Lark Case Card → claim lock → Thread bridge ↔ LINE`

Case-card actions to add after the extraction baseline is stable:

- claim case / atomic owner lock
- update the same Card through NEW → ASSIGNED → WON → RESOLVED
- Thread replies sent back to the mapped LINE user
- LINE Flex quotation
- PromptPay QR
- closed-won deal capture into Lark Base
- SLA / sales performance summary
- VIP / retarget multicast with preview and confirmation

## Lark Base business tables

Keep the customer-facing business model to three tables unless a real requirement forces expansion:

- `Customers`
- `Chat_Tracking`
- `Sales_Deals`

Operational idempotency, delivery retry, webhook dedupe, card-action locks and thread routing belong in runtime storage, not additional user-facing Base tables.
