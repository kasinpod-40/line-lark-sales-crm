# Repository Working Rules

This repository is the reusable LINE-only Lark Sales CRM product. Before changing code:

1. Read `docs/current-task.md` first.
2. Inspect the current branch/PR HEAD and open PRs; never trust a stale SHA from chat.
3. Keep the customer-facing Lark Base model to exactly three business tables unless an explicit new requirement changes that decision: `Customers`, `Chat_Tracking`, `Sales_Deals`.
4. Technical state (dedupe, retries, claim locks, routing, QR assets, drafts and expiring media-proxy metadata) belongs in D1/Queues, not additional Base tables. Lark message resources are the media authority; `/assets/media/<token>` may proxy an authorized Lark message resource for LINE when a public HTTPS URL is required. Do not introduce R2 unless a later explicit requirement needs independent object storage.
5. Reuse the LINE/AI/queue core already present here. Do not re-import marketplace/Shopee/Lazada/TikTok Shop/stock/order-routing code from the source CRM.
6. Financial actions must be previewed/confirmed and idempotent.
7. Delivery model is **single-stack only** for our golden implementation: no DEV/UAT/STAGING/PROD environment ladder. Local/CI are verification gates, then the real Lark/LINE/Cloudflare target is provisioned once and used for controlled E2E and continued operation. Read `docs/single-stack-delivery.md`.
8. Commercial deployment is **golden product → repeatable customer installation**. Read `docs/customer-deployment-model.md` and `deploy/product-manifest.json`. Customer-specific credentials/resource IDs are config, not business-logic forks.
9. Do not claim `live-ready` or `reusable-ready` without runtime evidence from the controlled E2E on the golden stack. Code completion before external setup is `code-complete`, not runtime verified.
10. Before enabling external callbacks on any installation, `/health` must return HTTP 200 with `configuration.ready=true`. Never weaken readiness checks merely to pass setup.
11. After each meaningful milestone, update `docs/current-task.md` with verified SHA/evidence/blockers/next step.
12. Do not delete/recreate the final Base or Cloudflare operational state merely to make a test pass. Diagnose and fix the root cause.
13. Any source/config/test/migration change after the last verified code SHA requires exact code HEAD CI again. Documentation-only commits may reference the last verified code SHA explicitly.
