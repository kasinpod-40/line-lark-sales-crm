# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Current Status

**CUSTOMER SRS RECEIVED — PREVIOUS CODE SCOPE PASSED CI, BUT FULL CUSTOMER SRS HAS NEW GAPS.**

Customer requirements baseline is now preserved in:

- `docs/customer-srs-sow-2026-08-22.md`
- `docs/customer-srs-gap-analysis.md`

Do not create the final customer Lark Base from the old schema unchanged yet. Reconcile the customer SRS gaps first, then finalize the exact 3-table schema and run CI again before Base creation/E2E.

The last code-bearing verified checkpoint before the customer SRS was:

`5d72a266b26dd61991edf48251c19be375ee2969`

GitHub CI run #29 / job `96880042393`: SUCCESS.
A later documentation checkpoint also passed CI run #30 / job `96880480816` with the same code layer.

Verified at that code layer:
- TypeScript strict typecheck: PASS
- Unit tests: 19/19 PASS
- LINE webhook HMAC + Queue normalization: PASS
- LINE retry-key `409 already accepted`: PASS
- AI/rule classification tests: PASS
- Quote calculation: PASS
- Direct close-deal snapshot: PASS
- PromptPay payload + CRC: PASS
- Lark Card lifecycle: PASS
- Wrangler deploy dry-run bundle: PASS
- npm audit during CI install: 0 vulnerabilities

These checks prove the previous agreed scope only. They do **not** prove the newly supplied full customer SRS is complete.

## Product Goal

Customers remain in LINE OA. Sales/Support/Manager work in Lark. One central Lark Sales Inbox group contains one root Case Card per active customer case and a Reply-in-Thread conversation. Lark Base contains business CRM data; D1/Queues contain operational state/idempotency/routing.

Target architecture for this repo remains cloud-native:

`LINE/Lark → Cloudflare Worker → Queue/D1/Workers AI → Lark Messenger/Lark Base/LINE API`

A separate NGINX/Tunnel layer is not required unless deployment later moves behind a private origin server.

## Customer SRS — Requirements That Already Exist

- Signed LINE webhook ingestion.
- Queue decoupling and fast webhook acknowledgment.
- LINE profile resolution.
- D1 race protection / one active case per LINE user.
- AI text classification + rule fallback.
- Image/payment-slip AI boundary.
- Lead score / Hot Lead / customer stage / AI summary.
- Root Lark Case Card blue → green → grey lifecycle.
- `wide_screen_mode` + `update_multi` on root Case Card.
- Immediate Lark card callback response with Worker `waitUntil()` background processing.
- Atomic Claim Case.
- Manual Quote form → Preview/Confirm → Sales_Deals snapshot → LINE Flex.
- Persisted Quote/Deal amount → PromptPay QR → LINE.
- Confirmed `ปิดยอด <amount>` → Closed Won → Active Customer → Payment Confirmation.
- First Response / Resolution timing and Sales Closed Won aggregate.
- VIP/retarget campaign Preview/Confirm + multicast batches of 500 + retry/idempotency state.

## Customer SRS — New Gaps To Implement Before Base Creation

### 1. Collaborative Thread permissions
Customer SRS explicitly allows Sales, Specialist and Manager to reply to the customer from the same Thread.

Current code is owner-only. Required change:
- Preserve one owner for KPI/Sales attribution.
- Allow authorized team members to send customer-facing Thread replies.
- Record actual responder per outbound message.
- Keep financial/ownership actions permission-controlled.

### 2. Strict root-chat warning
Current root-level group messages are not bridged, which is safe, but they are silently ignored.

Required:
- Detect user messages in the configured Sales Inbox outside a known case Thread.
- Never send them to LINE.
- Post a visible warning telling the user to use Reply in Thread.
- Ignore bot warning echoes.

### 3. Full 2-way media
Current:
- LINE inbound: text/image/sticker.
- Lark → LINE: text.

Customer SRS requires 2-way image, PDF/file, audio, location/GPS and sticker.

Required:
- Extend LINE normalization/content handling.
- Extend Lark message parsing/media download.
- Add safe cross-platform media mapping/sending.
- Add tests and explicit unsupported/size-limit behavior.

### 4. Smart close command variants
Add safe parsing for customer examples:
- `ยอดเงิน 150000`
- bare `30000` only when unambiguously treated as a case command and always Preview/Confirm before mutation.

### 5. VIP auto-upgrade
Current flow recalculates lifetime value but does not guess Gold/Diamond thresholds.

Required:
- Add configurable thresholds, e.g. `VIP_GOLD_MIN_THB`, `VIP_DIAMOND_MIN_THB`.
- If unset, preserve current VIP value; never invent a threshold.

### 6. SLA presentation
Add exact customer rule:
- <=5 minutes → `🟢 Fast (<5m)`
- otherwise Overdue.

Keep First Response separate from Resolution Time.

### 7. Broadcast semantics
Add:
- `บรอดแคสต์` command alias if used as generic entry.
- strict LINE User ID validation.
- safe individual fallback only when appropriate after multicast failure.
- accepted/failed observability.

Do not claim 100% end-user delivery guarantee; retries/fallback can improve request reliability but cannot guarantee the recipient receives/reads the message.

### 8. AI labels/guidance
Align explicit customer labels:
- Buy Intent / Purchase Order
- Price Inquiry / Quotation Request
- Technical Support / Demo Request
- General Inquiry

Add actionable guidance text on Card.

## Lark Base — Still Exactly 3 Business Tables

Customer SRS and project architecture agree on exactly:
1. `Customers`
2. `Chat_Tracking`
3. `Sales_Deals`

However the customer SRS uses different field names and linked/formula fields from the current code contract. Do not add Product or Quotation tables. Instead reconcile customer-visible names with the extra fields needed for Quote/QR/case routing inside the same three tables.

Before creating the Base, produce a final schema mapping covering:
- customer SRS display fields (`Customer_ID`, `Name`, `LINE_User_ID`, `Customer_Stage`, `VIP_Status`, `Total_Spend_THB`, links)
- SLA fields (`Customer_Msg_Time`, `Sales_Reply_Time`, `SLA_Minutes`, `SLA_Status`)
- Deal fields (`Deal_Value_THB`, `Sales_Rep`, `Deal_Status`, `Pipeline_Stage`, `Closed_At`)
- required supplemental fields for root/thread routing, AI signals, quotation snapshot, payment/QR state and idempotent workflow history.

Still only 3 Base tables.

## Cloud-Native Interpretation of Customer NFR

The customer document includes some long-lived Node/server concepts. For this Worker architecture:

- In-memory `userCreationLocks` must not be correctness authority; D1 atomic uniqueness/transactions remain the distributed race guard.
- `uncaughtException` / `unhandledRejection` are replaced by per-event error boundaries, Queue retry/DLQ and idempotency.
- Lark WebSocket auto-reconnect is not applicable while using HTTP webhook callbacks.
- local `logs/error.log` / `logs/combined.log` are not durable on Workers; use structured Worker observability/logging plus business audit in Base/D1.
- no separate NGINX reverse proxy is needed for a public Worker unless a future private origin is introduced.

## Next Implementation Order

1. Update collaboration authorization model while preserving one case owner.
2. Add root-chat isolation warning.
3. Implement required 2-way media types.
4. Expand close-command parser safely.
5. Add configurable VIP upgrade policy.
6. Add SLA Fast/Overdue labels.
7. Add broadcast alias/LINE-ID validation/safe fallback semantics.
8. Align AI labels and actionable guidance.
9. Reconcile the final 3-table Lark Base schema with customer field names.
10. Add/extend unit tests and run exact-HEAD CI including Wrangler dry-run.
11. Only after all gates pass: create Lark Base + external resources and run controlled E2E.

## Handoff Rule

Every future chat must read, in order:
1. `AGENTS.md`
2. this file
3. `docs/customer-srs-sow-2026-08-22.md`
4. `docs/customer-srs-gap-analysis.md`
5. current PR #1 HEAD + exact CI run

Never call the full customer SRS complete until the new gaps above are code-complete and exact-HEAD CI is green, then real LINE/Lark/Base E2E is executed.
