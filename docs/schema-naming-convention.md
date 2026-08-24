# Schema Naming Convention

Status: LOCKED — 2026-08-22 (ICT)

## Canonical rule

All Lark Base **API field names / column names used by this project must use lower snake_case**.

Examples:

- `customer_id`
- `line_user_id`
- `display_name`
- `customer_stage`
- `vip_status`
- `total_spend_thb`
- `customer_msg_time`
- `sales_reply_time`
- `sla_minutes`
- `sla_status`
- `deal_id`
- `deal_value_thb`
- `sales_rep`
- `deal_status`
- `pipeline_stage`
- `closed_at`

The customer SRS is preserved verbatim in `docs/customer-srs-sow-2026-08-22.md`, so names such as `Customer_ID`, `LINE_User_ID`, `Customer_Stage`, `Deal_Value_THB` are treated as **business/display labels from the source document**, not the canonical API contract.

## Mapping rule

When reconciling the final 3-table schema:

- `Customer_ID` → `customer_id`
- `Name` → `name` or the already-established semantic field `display_name` when it specifically means the LINE profile display name
- `LINE_User_ID` → `line_user_id`
- `Customer_Stage` → `customer_stage`
- `VIP_Status` → `vip_status`
- `Total_Spend_THB` → `total_spend_thb`
- `Customer_Msg_Time` → `customer_msg_time`
- `Sales_Reply_Time` → `sales_reply_time`
- `SLA_Minutes` → `sla_minutes`
- `SLA_Status` → `sla_status`
- `Deal_ID` → `deal_id`
- `Deal_Value_THB` → `deal_value_thb`
- `Sales_Rep` → `sales_rep`
- `Deal_Status` → `deal_status`
- `Pipeline_Stage` → `pipeline_stage`
- `Closed_At` → `closed_at`

Supplemental workflow fields for Quote, QR, case routing, AI and message audit must follow the same lower snake_case rule.

## Table names

Keep the three business table names as agreed:

1. `Customers`
2. `Chat_Tracking`
3. `Sales_Deals`

Only field/column contracts are normalized to lower snake_case. Table names do not need to be renamed unless a later explicit decision changes them.

## Engineering rule

Code, docs, tests, Lark Base creation scripts/operators and E2E assertions must reference the same canonical snake_case names. Do not maintain duplicate TitleCase and snake_case columns for the same concept.

If a user-facing Lark view needs prettier labels later, presentation should be handled in the UI/view layer where possible rather than changing the API field contract.
