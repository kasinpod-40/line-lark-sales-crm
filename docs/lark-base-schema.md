# Final Lark Base Schema — 3 Business Tables Only

Status: **FINAL CODE CONTRACT BEFORE REAL BASE PROVISIONING**

The customer SRS uses TitleCase examples, but this project deliberately uses **lower `snake_case` field names**. Do not create duplicate TitleCase fields.

Business tables remain exactly:

1. `Customers`
2. `Chat_Tracking`
3. `Sales_Deals`

No Product table and no separate Quotation table are required for the agreed scope.

> `D1`, Queue and R2 are backend operational infrastructure. They are not additional Lark Base business tables.

---

## 1) `Customers`

Primary field: `customer_id` — Text

| Field | Type | Required / behavior |
|---|---|---|
| `customer_id` | Text / Primary | canonical `line:<line_user_id>` |
| `line_user_id` | Text | LINE user ID; unique by application logic |
| `display_name` | Text | LINE profile display name |
| `picture_url` | URL/Text | LINE profile image |
| `customer_stage` | Single Select | `🌱 New Lead`, `💬 Contacted`, `📄 Quotation Sent`, `🏆 Active Customer`, `💤 Inactive` |
| `vip_status` | Single Select | `Standard`, `🥇 Gold VIP`, `💎 Diamond VIP` |
| `total_spend_thb` | Rollup / Currency | sum of Closed Won value through `deals`; read-only to application |
| `assigned_sales_id` | Text | Lark owner open_id |
| `assigned_sales_name` | Text | current Case Owner display name |
| `ai_intent` | Text | canonical AI intent key |
| `ai_intent_label` | Text | customer-friendly SRS intent label |
| `buyer_intent` | Text | buyer-intent classification |
| `lead_quality` | Single Select | `🔥 Hot Lead`, `⚡ High Intent`, `🌱 New Lead` |
| `lead_score` | Number | 0–100 |
| `hot_lead` | Checkbox | boolean |
| `ai_summary` | Text | short AI summary |
| `ai_guidance` | Text | actionable Sales Copilot guidance |
| `last_message_at` | DateTime | milliseconds from backend |
| `created_at` | DateTime | milliseconds |
| `updated_at` | DateTime | milliseconds |
| `chat_history` | Backlink | reverse link from `Chat_Tracking.customer` |
| `deals` | Backlink | reverse link from `Sales_Deals.customer` |

### Customer stage mutation rules

```text
new customer        -> 🌱 New Lead
Claim Case          -> 💬 Contacted
quotation sent      -> 📄 Quotation Sent
Closed Won          -> 🏆 Active Customer
lost/inactive flow  -> 💤 Inactive
```

An existing `🏆 Active Customer` is never downgraded just because a later inbound AI classification says New Lead.

### VIP policy

VIP is upgraded from cumulative Closed Won value only when the deployment defines:

- `VIP_GOLD_MIN_THB`
- `VIP_DIAMOND_MIN_THB`

If no thresholds are configured, the backend preserves the existing `vip_status` instead of inventing business thresholds.

---

## 2) `Chat_Tracking`

Primary field: `tracking_id` — Text

This table intentionally contains both `CASE` and `MESSAGE` rows so the customer business model remains exactly three tables.

| Field | Type | Required / behavior |
|---|---|---|
| `tracking_id` | Text / Primary | `case:<case_id>`, `line:<message_id>`, `lark:<message_id>` |
| `record_type` | Single Select | `CASE`, `MESSAGE` |
| `case_id` | Text | case identity |
| `customer` | Link to `Customers` | relation to customer record |
| `customer_id` | Text | stable customer key for API/audit |
| `customer_msg_time` | DateTime | CASE: first inbound time; MESSAGE: inbound event time |
| `sales_reply_time` | DateTime | CASE: first actual outbound reply; MESSAGE: outbound event time |
| `assigned_sales` | Text | CASE row = Case Owner; outbound MESSAGE row = actual responder |
| `assigned_sales_id` | Text | Lark open_id matching `assigned_sales` |
| `ai_intent` | Text | latest case intent on CASE row |
| `lead_quality` | Text | optional/reporting display field |
| `channel` | Single Select | `🟢 LINE Official Account` |
| `sla_minutes` | Formula | First Response SLA in minutes; derive `sales_reply_time - customer_msg_time` |
| `sla_status` | Formula | `<= 5m` => `🟢 Fast (<5m)`, otherwise `🔴 Overdue SLA`; blank/waiting before reply |
| `direction` | Single Select | `customer_to_sales`, `sales_to_customer` on MESSAGE rows |
| `message_type` | Text | text/image/file/audio/location/sticker/etc. |
| `message_id` | Text | original LINE or Lark message ID |
| `message_text` | Text | text or safe media summary |
| `event_at` | DateTime | message timestamp |
| `lark_root_message_id` | Text | root Case Card message ID; routing authority |
| `lark_thread_id` | Text | reserved for stable Lark thread ID if exposed |
| `case_status` | Single Select | `NEW`, `CLAIMED`, `IN_PROGRESS`, `QUOTED`, `PAYMENT`, `WON`, `RESOLVED` |
| `opened_at` | DateTime | case opened |
| `claimed_at` | DateTime | atomic claim time |
| `claim_seconds` | Number | opened -> claimed |
| `first_response_at` | DateTime | first team reply actually bridged to LINE |
| `first_response_seconds` | Number | backend mirror of First Response SLA |
| `closed_at` | DateTime | case resolved |
| `resolution_seconds` | Number | opened -> resolved; separate from SLA |
| `updated_at` | DateTime | backend mutation time |

### Collaboration semantics

- `CASE` row keeps the Case Owner for KPI/Deal attribution.
- Any human member inside the configured Sales Inbox Thread may assist with customer-facing replies after the case is claimed.
- Each outbound `MESSAGE` row records the **actual responder** in `assigned_sales` / `assigned_sales_id`.
- Financial actions, campaign confirmation and Closed Won mutation remain Case-Owner-only.

This keeps owner attribution and actual responder audit separate without creating a fourth table.

---

## 3) `Sales_Deals`

Primary field: `deal_id` — Text

| Field | Type | Required / behavior |
|---|---|---|
| `deal_id` | Text / Primary | deterministic draft/deal identity |
| `case_id` | Text | originating case |
| `customer` | Link to `Customers` | business relation |
| `customer_id` | Text | stable customer key |
| `deal_value_thb` | Currency / Number | current/final deal value; Closed Won amount |
| `sales_id` | Text | Case Owner Lark open_id |
| `sales_rep` | Text | Case Owner display name |
| `deal_status` | Single Select | `Open`, `Closed Won 🏆`, `Closed Lost` |
| `pipeline_stage` | Single Select | `Lead`, `Quotation`, `Payment Received`, `Closed Won` |
| `closed_won_value_thb` | Formula / Currency | Closed Won value only; otherwise 0; used by Customers rollup |
| `quotation_no` | Text | quotation number |
| `quotation_status` | Text | `Pending Send`, `Sent`, `Not Required`, etc. |
| `quotation_items_json` | Long Text | immutable manual line-item snapshot |
| `subtotal` | Currency / Number | THB |
| `discount` | Currency / Number | THB |
| `vat_rate` | Number | percent |
| `vat_amount` | Currency / Number | THB |
| `shipping_fee` | Currency / Number | THB |
| `total_amount` | Currency / Number | quotation total; QR default source |
| `quotation_note` | Text | optional |
| `quotation_valid_until` | Text/Date | quote validity as entered |
| `quotation_sent_at` | DateTime | successful LINE quotation send |
| `payment_amount` | Currency / Number | QR/final payment amount |
| `payment_status` | Single Select/Text | `Pending`, `Pending QR Send`, `QR Sent`, `Paid` |
| `qr_sent_at` | DateTime | successful QR send |
| `closed_at` | DateTime | Closed Won/Closed Lost timestamp |
| `created_at` | DateTime | milliseconds |
| `updated_at` | DateTime | milliseconds |

### Quote / QR / close sequence

```text
manual quote form
  -> Preview / Confirm
  -> save Sales_Deals quotation snapshot FIRST
  -> LINE Flex quotation
  -> customer_stage = 📄 Quotation Sent

QR action
  -> read latest Sales_Deals total_amount
  -> Preview / Confirm
  -> PromptPay QR
  -> LINE

ปิดยอด <amount> / ยอดเงิน <amount>
  -> confirmation
  -> Sales_Deals Closed Won 🏆
  -> Customers 🏆 Active Customer
  -> configurable VIP recalculation
  -> LINE Payment Confirmation
```

A direct Close Won with no prior quote creates a minimal auditable `Sales_Deals` snapshot first; it never needs a Product/Quotation table.

---

## Suggested formulas / relations during Base provisioning

The final provisioning step should create equivalent formulas using the Lark Base formula editor supported by the target workspace:

- `Chat_Tracking.sla_minutes`: rounded minutes between `sales_reply_time` and `customer_msg_time`.
- `Chat_Tracking.sla_status`: waiting when no reply; `🟢 Fast (<5m)` when elapsed <= 5 minutes; otherwise `🔴 Overdue SLA`.
- `Sales_Deals.closed_won_value_thb`: `deal_value_thb` only when `deal_status = Closed Won 🏆`, otherwise `0`.
- `Customers.total_spend_thb`: SUM rollup of linked `Sales_Deals.closed_won_value_thb`.

The backend also calculates First Response and Resolution independently for the live Executive Card, so card correctness does not depend on formula materialization latency.

---

## Non-business operational storage

Do **not** add Base tables for:

- webhook/card idempotency
- case routing and atomic owner lock
- interaction drafts
- QR asset authorization
- media assets
- Queue retry state
- campaign batch delivery state

Those belong to Cloudflare D1/Queue/R2.
