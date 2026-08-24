# Lark Base UX / Presentation Contract

The golden/reference Base must be presentation-ready, not only schema-correct.

Canonical assets:
- `deploy/lark-base-ux-contract.json`
- `scripts/provision-lark-base-ux.mjs`

The UX contract is intentionally richer than the supplied customer demo while preserving the exact reusable business-table contract:
- `Customers`
- `Chat_Tracking`
- `Sales_Deals`

It provisions **22 curated views** across the three tables and **2 dashboards with 23 blocks**:
- `🚀 Executive CRM Command Center`
- `⚡ Sales Ops & SLA Control Room`

View names are intentional Thai/English business labels with emoji icons. The apply reconciler renames/reuses the platform-created default view, creates missing curated views, applies visible-field order/filter/group/sort settings, and removes leftover auto-generated views so localized/default names do not remain.

## Plan

```bash
npm run lark:base:ux:plan
```

Plan mode performs zero Lark mutations.

## Apply to an existing completed Base

```bash
npm run lark:base:ux:apply -- --base-token <base_token>
```

The UX provisioner refuses to run unless the exact three-table schema and expected fields/formulas/backlinks already exist. It does not create/delete business tables or fields.

## Table icons

Locked assignments:
- `Customers` → 👥
- `Chat_Tracking` → 💬
- `Sales_Deals` → 💰

Current supported Lark Base v3 table update and official `lark-cli` expose table-name mutation but no table/sidebar icon setter. Therefore the three table sidebar icons are a deliberate one-time UI pass after the automated UX apply. Do **not** prefix the table names with emoji because the exact table names are part of the reusable runtime contract.

Dashboard and View names include their icons programmatically.
