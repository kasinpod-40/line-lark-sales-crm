# LINE ↔ Lark Sales CRM

LINE-only extraction from `kasinpod-40/omnichannel-commerce-crm` for a Lark-based sales inbox.

## Scope

This repository intentionally keeps only the reusable LINE vertical and the minimum AI/message-processing contracts needed for the new Lark workflow.

Target flow:

`LINE OA → webhook → queue → LINE consumer → AI/customer resolution → Lark Case Card → Thread bridge → LINE reply`

Planned Lark sales actions: case claim/lock, quotation Flex Message, PromptPay QR, closed-won capture, SLA summary, and segmented CRM multicast.

## Source baseline

Extraction source: `kasinpod-40/omnichannel-commerce-crm` `main`.

Marketplace connectors and commerce-specific Shopee/Lazada/TikTok routing are intentionally excluded.
