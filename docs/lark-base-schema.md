# Lark Base Schema — 3 Tables Only

Create these tables before the first integration test. Field names are API contracts; use the exact spelling below.

For the first test, use Text fields for statuses/labels rather than Single Select. This avoids option-ID/config drift. Visual select fields can be introduced later only with a controlled migration.

## 1) Customers

Primary field: `customer_id` (Text)

| Field | Type | Notes |
|---|---|---|
| customer_id | Text | `line:<LINE user id>` |
| line_user_id | Text | unique LINE user ID |
| display_name | Text | LINE profile name |
| picture_url | Text | LINE profile image URL |
| stage | Text | New Lead / Interested / Negotiating / Closing / Active Customer / Lost |
| vip_level | Text | default `Standard`; custom values qualify for VIP segment |
| assigned_sales_id | Text | Lark open_id |
| assigned_sales_name | Text | Sales display name |
| ai_intent | Text | AI/rule intent |
| buyer_intent | Text | Just Browsing / Interested / Purchase Intent / Ready To Buy |
| lead_score | Number | 0-100 |
| hot_lead | Checkbox | true/false |
| ai_summary | Text | short summary |
| last_message_at | Date | millisecond timestamp from backend |
| lifetime_value | Number | recomputed from Closed Won deals |
| created_at | Date | millisecond timestamp |
| updated_at | Date | millisecond timestamp |

## 2) Chat_Tracking

Primary field: `tracking_id` (Text)

This one table holds both CASE and MESSAGE rows so we keep exactly three business tables.

| Field | Type | Notes |
|---|---|---|
| tracking_id | Text | `case:<case_id>`, `line:<message_id>`, or `lark:<message_id>` |
| record_type | Text | CASE / MESSAGE |
| case_id | Text | case identity |
| customer_id | Text | links conceptually to Customers.customer_id |
| sales_id | Text | owner Lark open_id |
| sales_name | Text | owner display name |
| direction | Text | customer_to_sales / sales_to_customer (MESSAGE rows) |
| message_type | Text | text / image / sticker |
| message_id | Text | LINE or Lark message ID |
| message_text | Text | message/summarized image content |
| event_at | Date | MESSAGE timestamp |
| lark_root_message_id | Text | root Case Card message ID (CASE row) |
| lark_thread_id | Text | reserved if Lark returns a stable thread id; root id remains routing authority |
| case_status | Text | NEW / CLAIMED / IN_PROGRESS / QUOTED / PAYMENT / WON / RESOLVED |
| opened_at | Date | case opened |
| claimed_at | Date | claim timestamp |
| claim_seconds | Number | opened→claimed |
| first_response_at | Date | first actual Sales→LINE message |
| first_response_seconds | Number | opened→first response SLA |
| closed_at | Date | case close timestamp |
| resolution_seconds | Number | opened→closed |

## 3) Sales_Deals

Primary field: `deal_id` (Text)

| Field | Type | Notes |
|---|---|---|
| deal_id | Text | deterministic quote draft identity or generated deal identity |
| case_id | Text | originating case |
| customer_id | Text | originating customer |
| sales_id | Text | owner Lark open_id |
| sales_name | Text | owner name |
| quotation_no | Text | manual/auto quotation number |
| quotation_status | Text | Sent etc. |
| quotation_items_json | Text | immutable line-item snapshot JSON |
| subtotal | Number | baht |
| discount | Number | baht |
| vat_rate | Number | percent |
| vat_amount | Number | baht |
| shipping_fee | Number | baht |
| total_amount | Number | baht; QR defaults from this value |
| quotation_note | Text | optional |
| quotation_valid_until | Text | ISO/date-like display string from Sales form |
| quotation_sent_at | Date | milliseconds |
| payment_amount | Number | final/QR amount |
| payment_status | Text | Pending / QR Sent / Paid |
| qr_sent_at | Date | milliseconds |
| deal_status | Text | Open / Closed Won |
| closed_at | Date | milliseconds |
| created_at | Date | milliseconds |
| updated_at | Date | milliseconds |

## Relations

- One Customer → many CASE rows in Chat_Tracking.
- One Customer → many MESSAGE rows in Chat_Tracking.
- One Customer → many Sales_Deals.
- One Case → zero or many historical deals/quotes; the latest active deal is used for QR by default.

Do not add Product or Quotation tables for the current scope. Quote items are manual input and stored as a snapshot in `Sales_Deals.quotation_items_json`.
