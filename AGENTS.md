# Repository Working Rules

This repository is the LINE-only Lark Sales CRM. Before changing code:

1. Read `docs/current-task.md` first.
2. Inspect the current branch/PR HEAD and open PRs; never trust a stale SHA from chat.
3. Keep the customer-facing Lark Base model to exactly three business tables unless an explicit new requirement changes that decision: `Customers`, `Chat_Tracking`, `Sales_Deals`.
4. Technical state (dedupe, retries, claim locks, routing, QR assets, drafts, media metadata) belongs in D1/Queues/R2, not additional Base tables.
5. Reuse the LINE/AI/queue core already present here. Do not re-import marketplace/Shopee/Lazada/TikTok Shop/stock/order-routing code from the source CRM.
6. Financial actions must be previewed/confirmed and idempotent.
7. Delivery model is **single-stack only** for our implementation: no DEV/UAT/STAGING/PROD environment ladder. Local/CI are verification gates, then our real Lark/LINE/Cloudflare target is provisioned once and used for controlled E2E and continued operation. Read `docs/single-stack-delivery.md`.
8. Do not claim `live-ready` without runtime evidence from the controlled E2E on that final stack. Code completion before external setup is `code-complete`, not runtime verified.
9. After each meaningful milestone, update `docs/current-task.md` with verified SHA/evidence/blockers/next step.
10. Do not delete/recreate the final Base or Cloudflare operational state merely to make a test pass. Diagnose and fix the root cause.
11. The finished system is a **reusable product/golden stack**. Customer sales should deploy the same verified product into customer-specific resources by changing secrets/vars/bindings/provisioned IDs, not by forking business logic or hard-coding customer IDs/credentials. Read `docs/customer-deployment-model.md`.
