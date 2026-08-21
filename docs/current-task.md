# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Purpose

Build a LINE-only Sales CRM where customers remain in LINE OA and sales staff work entirely from Lark.

Core UX:

LINE customer → LINE webhook/queue/AI → Lark Sales Inbox Case Card → Sales claims case → Card updates in place → Sales uses Reply in Thread → reply is bridged back to the same LINE customer.

The root Lark Card is the live case control center. The Thread is the conversation. Lark Base is the CRM/business-data store. Backend DB/queue owns operational state such as idempotency, retries, locks, delivery state, and message/thread routing.

## Locked Product Decisions

1. One Lark Sales Inbox group; do NOT create a new Lark chat per customer by default.
2. One customer case = one root Lark Card + its Reply-in-Thread conversation.
3. Important events update the same root Card in place: NEW → CLAIMED → IN PROGRESS/QUOTED/PAYMENT → WON → RESOLVED.
4. Claim Case must be atomic so two salespeople cannot own the same case.
5. Customer talks only through LINE OA. Sales talks only through Lark.
6. Reuse the existing LINE vertical from `kasinpod-40/omnichannel-commerce-crm`; do not copy the whole omnichannel/commerce system.
7. Reuse existing LINE webhook/signature/event normalization/queue/provider and reusable AI analysis contracts/logic.
8. Exclude Marketplace/Shopee/Lazada/TikTok Shop/stock/order-routing logic unless a future explicit requirement needs it.
9. Do not copy the old `process-incoming-message.usecase.ts` wholesale because it couples Orders, Payments, Pipeline, Lost Sale, and commerce notifications.
10. Customer requested exactly three Lark Base business tables for current scope. Do not add Product/Quotation tables without a new requirement.

## Five Required Customer Capabilities

### 1. Customer alert + AI intent + claim case
- LINE message creates/updates a blue Lark Case Card.
- Show customer identity, latest message, AI intent, buyer intent, lead score/hot-lead signal, and summary as appropriate.
- `[🙋 รับเคสนี้]` atomically assigns owner.
- Same Card changes to assigned/green state and shows Sales owner.

### 2. One-click sales tools: quotation + PromptPay QR
No Product table is currently provided or required.

Quotation flow:
`[🎨 ส่งใบเสนอราคา]` → Lark modal/manual entry → calculate totals → preview/confirm → persist quotation snapshot in `Sales_Deals` → send LINE Flex Message → update root Card.

Suggested manual fields: quotation number, line-item descriptions, quantity, unit price, discount, VAT/tax mode, shipping, notes, validity, subtotal, total.

QR flow:
`[💳 ส่ง QR ชำระเงิน]` → load latest active quote/deal total from `Sales_Deals` → prefill amount in confirmation modal → allow authorized correction if needed → generate PromptPay QR → send high-quality image/payment message to LINE → update root Card.

Important: Quote/payment actions must use Preview/Confirm and idempotency. Do not infer/send financial values blindly from chat text.

### 3. Smart Deal Closing
Sales can type a command such as `ปิดยอด 45000` in the case Thread. Parse it into a proposed close action, then require confirmation before mutation.

On confirmation:
- `Sales_Deals`: payment/Closed Won state and amount.
- `Customers`: upgrade CRM stage to Active Customer/Won representation agreed in schema.
- Send LINE payment confirmation/E-Receipt-style message (do not claim legal tax-document status unless a real accounting/tax integration exists).
- Update root Case Card.

### 4. Executive post-case analytics
`[✅ ปิดเคสนี้]` updates the same Card to final summary including at least:
- First Response SLA.
- Resolution time.
- Closed Won amount for case.
- Sales cumulative Closed Won amount and deal count.

### 5. CRM multicast / promotion
Lark command such as `ยิงโปร vip` or `ยิงโปร retarget` resolves a segment from Base, shows preview/count, requires confirmation, then sends the LINE campaign to eligible users. No blind immediate broadcast from free text.

## Lark Base — Locked 3 Tables

### Customers
Business identity/current CRM state. Expected concepts:
- customer_id
- line_user_id
- display_name/profile
- stage
- vip_level
- assigned_sales
- ai_intent
- buyer_intent
- lead_score
- hot_lead
- ai_summary
- last_message_at
- lifetime_value

One Customer may have many cases and many deals.

### Chat_Tracking
Case/chat/SLA tracking and Lark routing metadata. Expected concepts:
- tracking_id / case_id
- customer_id
- sales_id / owner
- lark_root_message_id
- lark_thread/root routing identifier(s) supported by actual API
- opened_at
- claimed_at
- first_response_at
- first_response_seconds
- closed_at
- resolution_seconds
- case_status
- direction/message timestamps as needed for SLA

### Sales_Deals
Quotation/payment/deal history. Expected concepts:
- deal_id
- case_id
- customer_id
- sales_id
- quotation_no
- quotation_status
- quotation_items_json or equivalent quotation snapshot
- subtotal
- discount
- vat/tax fields
- shipping_fee
- total_amount
- quotation_note
- quotation_valid_until
- quotation_sent_at
- payment_amount
- payment_status
- qr_sent_at
- deal_status
- closed_at

A customer can have multiple `Sales_Deals`; do not model Customer = one Deal.

## Operational State — NOT Base Business Tables
Keep these in backend DB/queue/runtime, not as extra customer-facing Base tables:
- LINE webhook idempotency/redelivery state
- queue retry/DLQ state
- Lark card-action claim locks
- LINE delivery retry/state
- root-message/thread ↔ case ↔ LINE user routing
- mutation/idempotency keys

## Current Repository State

Repository: `kasinpod-40/line-lark-sales-crm`

Current extraction work:
- Branch: `work/extract-line-core-v1`
- Draft PR: #1 `feat: extract LINE-only CRM core`
- PR was opened from extraction HEAD `1c776e29f4bfd6bba10c2f47e6237ab43e0969c8`; this document is a later commit on the same branch, so always read current branch/PR HEAD rather than treating that SHA as current forever.

Already extracted/started:
- LINE webhook signature verification/provider boundary
- LINE profile/content APIs
- LINE webhook normalization for text/image/sticker
- LINE queue contract + producer
- AI lead-analysis contract
- narrow LINE inbound → sales-case processing boundary
- extraction map documenting reuse/adapt/exclude decisions

Not complete yet:
- production-ready LINE-only consumer wired to the new case pipeline
- Lark Case Card renderer/lifecycle
- atomic Claim Case action
- Reply-in-Thread ↔ LINE two-way bridge
- Base schema/application for the three tables
- quotation modal/persistence/Flex sender
- PromptPay QR action
- smart deal-close command/confirmation
- final SLA/performance Card
- VIP/retarget multicast flow
- end-to-end tests, CI gates, deployment/runtime verification

## Next Implementation Order

1. Audit current PR #1 HEAD and dependency completeness; make extracted LINE core compile/test independently.
2. Implement minimal LINE-only consumer and case/customer resolution boundary.
3. Define backend routing/idempotency state and the three Base table contracts.
4. Implement Lark Sales Inbox root Case Card + atomic Claim Case.
5. Implement inbound LINE → case Thread and Lark Thread reply → LINE bridge.
6. Implement quotation modal → `Sales_Deals` persistence → LINE Flex → Card update.
7. Implement QR from persisted deal total → confirmation → PromptPay QR → LINE → Card update.
8. Implement confirmed smart deal closing and Customer/Deal updates.
9. Implement close-case SLA + Sales aggregate summary.
10. Implement preview/confirm VIP/retarget multicast.
11. Run full E2E, failure/idempotency/retry tests, then controlled deployment.

## Rules for Future Chats / Handoffs

Before making changes:
1. Read this file first.
2. Read repository instructions/AGENTS.md if present.
3. Inspect latest branch/PR HEAD and open PRs; do not trust an old SHA in chat.
4. Reuse existing shared LINE/AI/queue code before adding new engines/wrappers.
5. Do not merge/deploy/mutate customer production merely because a design step is complete.
6. Record completed milestone, exact verified SHA, tests/CI/runtime evidence, blockers, and next step back into this file after meaningful progress.
7. Never mark a capability complete based only on design discussion; require code + test/runtime evidence appropriate to that milestone.
