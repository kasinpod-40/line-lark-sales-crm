# Repository Working Rules

This repository is the LINE-only Lark Sales CRM. Before changing code:

1. Read `docs/current-task.md` first.
2. Inspect the current branch/PR HEAD and open PRs; never trust a stale SHA from chat.
3. Keep the customer-facing Lark Base model to exactly three business tables unless an explicit new requirement changes that decision: `Customers`, `Chat_Tracking`, `Sales_Deals`.
4. Technical state (dedupe, retries, claim locks, routing, QR assets, drafts) belongs in D1/Queues, not additional Base tables.
5. Reuse the LINE/AI/queue core already present here. Do not re-import marketplace/Shopee/Lazada/TikTok Shop/stock/order-routing code from the source CRM.
6. Financial actions must be previewed/confirmed and idempotent.
7. Do not claim production completion without runtime evidence. Code completion before customer Base exists is `integration-ready`, not `production verified`.
8. After each meaningful milestone, update `docs/current-task.md` with verified SHA/evidence/blockers/next step.
