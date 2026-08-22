# Customer SRS Gap Analysis

Source: `docs/customer-srs-sow-2026-08-22.md`

Status date: 2026-08-22 (ICT)

## Executive status

The repository was integration-ready for the previously agreed LINE-only Sales CRM scope, but the customer SRS introduces additional requirements and several architecture/schema differences. Therefore the correct status against the **full customer SRS** is now:

**PARTIALLY IMPLEMENTED — additional code and schema alignment required before Lark Base creation/E2E.**

Do not treat the previous integration-ready checkpoint as full SRS completion.

## Requirements that already align well

### Module 1 — inbound / identity
- LINE webhook signature verification: implemented.
- Fast webhook acceptance through Queue: implemented.
- LINE profile/name resolution: implemented.
- D1-based one-active-case uniqueness / race protection: implemented and stronger than an in-memory Promise lock for distributed Workers.
- Customer + case/message tracking repositories: implemented, but field names/schema need alignment with customer SRS.

### Module 2 — AI Sales Copilot
- Text intent classification: implemented with Workers AI + deterministic fallback.
- Image analysis/payment-slip signal: implemented.
- Lead score/hot-lead/business stage: implemented.
- AI summary shown on Case Card: implemented.
- Customer SRS adds explicit Technical Support / Demo intent labeling and actionable guidance wording; this needs alignment.

### Module 3 — Lark Card
- Blue new-case / green assigned / grey resolved Card lifecycle: implemented.
- Same root Card patch/update architecture: implemented.
- Claim / Quote / QR / Close Deal / Retarget / Close Case actions: implemented.
- `wide_screen_mode: true` and `update_multi: true` on the root Case Card: implemented.
- `card.action.trigger` returns immediately and uses Worker `waitUntil()` for background mutation/outbound: implemented.
- Manual Quote entry is required because there is no Product table; the button starts the flow with one click, then Sales fills Preview/Confirm form.

### Module 5 — Deal / QR
- `ปิดยอด <amount>` parser + confirmation: implemented.
- Closed Won + customer Active Customer + lifetime-value recalculation: implemented.
- PromptPay payload/QR generation: implemented.
- Payment Confirmation message avoids pretending to be a legal tax invoice: implemented.
- Customer SRS adds more close parser forms (`ยอดเงิน 150000`, bare `30000`) and automatic VIP adjustment; not yet implemented.

### Module 6 — analytics
- First Response timing: implemented.
- Resolution timing: implemented.
- Sales Closed Won aggregate amount/count: implemented.
- Final same-Card mutation: implemented.
- SRS requires explicit <=5 minute SLA label; current Card shows elapsed seconds but does not yet present the exact Fast/Overdue label.

### Module 7 — broadcast
- VIP/retarget command handling: implemented.
- Preview/Confirm before send: implemented.
- LINE multicast batching max 500 + stable retry key/D1 state: implemented.
- SRS adds `บรอดแคสต์` alias, strict LINE User ID regex and per-recipient fallback-loop semantics; not fully implemented.

## Material gaps / conflicts requiring code changes

### GAP-A — Team collaboration vs current owner-only security

Customer SRS 4.1 says **Sales, Specialist and Manager may all reply from the case Thread and those replies should reach the LINE customer**.

Current implementation intentionally blocks every non-owner reply and every non-owner action.

Required redesign:
- Keep one **case owner** for KPI/Sales attribution.
- Allow authorized Lark team members in the same Sales Inbox Thread to send customer-facing replies.
- Keep financial/ownership actions permission-controlled (owner and/or configured roles).
- Track actual responder identity per outbound message separately from case owner.

This is the largest behavioral conflict with the previous product decision.

### GAP-B — Strict root-chat warning

Current Lark event parser only bridges messages that have a known root/thread ID; root-level group messages are therefore not routed to LINE, which is safe.

Customer SRS additionally requires a visible orange warning telling Sales to use Reply in Thread. Current root-level messages are ignored rather than actively warned.

Required:
- Detect messages sent in the configured Sales Inbox group with no case root.
- Never send them to LINE.
- Return/post a warning in Lark without creating a customer route.
- Avoid warning loops on bot-generated warnings.

### GAP-C — 2-way media coverage

Current state:
- LINE inbound: text/image/sticker supported.
- Lark → LINE: text only.
- LINE inbound image can be surfaced/analyzed.

Customer SRS requires 2-way:
- JPEG/PNG
- PDF/file
- audio
- location/GPS
- sticker

Required:
- Extend LINE event normalization for audio/file/location and appropriate content metadata.
- Extend Lark event parsing for image/file/audio/location-like message types.
- Add Lark media download + LINE media upload/send adapters where APIs permit.
- Define unsupported conversion behavior explicitly (e.g. sticker compatibility, file size/type limits).
- Add E2E tests per media type.

### GAP-D — Smart Deal command coverage

Current parser accepts `ปิดยอด 45000`.

SRS examples additionally include:
- `ยอดเงิน 150000`
- bare numeric `30000`

Bare-number close is dangerous in normal chat. Engineering interpretation should require the message to be in a known case Thread and should still show Confirm before mutation. It may be implemented only when it is unambiguously a command.

### GAP-E — VIP auto-upgrade policy

Current Closed Won flow marks customer Active Customer and recalculates lifetime value, but does not automatically choose `Standard / Gold / Diamond`.

Customer SRS requires VIP adjustment but gives no spend thresholds.

Required before deterministic implementation:
- Put VIP thresholds in configuration (not hard-coded assumptions), e.g. `VIP_GOLD_MIN_THB`, `VIP_DIAMOND_MIN_THB`.
- Default behavior when thresholds are unset: preserve existing VIP status, never guess.

### GAP-F — SLA exact representation

SRS explicitly wants `SLA_Minutes` and `SLA_Status` with <=5m Fast rule.

Current backend calculates first-response seconds and final card shows elapsed seconds.

Required:
- Add exact Fast/Overdue presentation.
- Align Base fields/formulas or store backend-computed equivalent.
- Preserve first-response vs resolution as separate metrics.

### GAP-G — Broadcast semantics

SRS says fallback individual send should guarantee 100% delivery. No messaging platform can truthfully guarantee 100% end-user delivery; retries can only improve accepted-request reliability.

Required safe interpretation:
- Validate `LINE_User_ID` format before send.
- Multicast in batches.
- Retry transient/API failures with idempotency.
- Optionally fall back to individual push for a failed multicast request when safe.
- Record accepted/failed/unreachable results where observable.
- Never claim 100% delivery guarantee.

Add command alias `บรอดแคสต์` if customer wants a general campaign entry point.

## Architecture differences — customer wording vs deployed target

### Reverse Proxy / NGINX
Customer document names Cloudflare Anycast Tunnel / NGINX Reverse Proxy.

Current architecture is a public Cloudflare Worker endpoint. It already provides HTTPS/edge ingress, so a separate NGINX/Tunnel layer is not required unless the final deployment moves the Bridge Core to a private VM/container/origin.

Recommended target for this repo:
`LINE/Lark → Cloudflare Worker → Queue/D1/AI → LINE/Lark/Base`

Do not add NGINX only to match a diagram if there is no private origin server.

### Bridge Core Server
Customer lists Node.js / Go / Python. This repo uses TypeScript on Cloudflare Workers with Node compatibility where needed. This satisfies the logical Bridge Core role while remaining serverless.

### Promise Lock (`userCreationLocks`)
An in-memory Promise lock is process-local and is not sufficient across multiple Worker isolates/instances. Current D1 uniqueness/atomic operations should remain the authoritative concurrency guard. A process-local lock may be used only as a local optimization, not correctness authority.

### WebSocket auto-reconnect
Current integration uses HTTP webhooks, not a persistent Lark WebSocket client. WebSocket reconnection is therefore not applicable unless deployment strategy changes to WebSocket event delivery.

### `uncaughtException` / `unhandledRejection`
These are Node long-lived-process concepts. Cloudflare Workers are request/event scoped. Reliability should instead use:
- per-event try/catch
- Queue retries + DLQ
- idempotency/dedupe
- structured error logging/observability
- health/readiness checks

### File logging (`logs/error.log`, `logs/combined.log`)
Workers do not provide a normal durable local filesystem. Replace with structured Worker logs/logpush/observability and keep business audit records in Base/D1 as appropriate.

## Lark Base schema mismatch

The customer SRS names exactly three tables, which matches the project decision, but the **field contracts differ materially**.

Customer document uses display/business fields such as:
- `Customer_ID`, `Name`, `LINE_User_ID`, `Customer_Stage`, `VIP_Status`, `Total_Spend_THB`
- linked `Customer`, `Chat_History`, `Deals`
- `Customer_Msg_Time`, `Sales_Reply_Time`, `SLA_Minutes`, `SLA_Status`
- `Deal_Value_THB`, `Sales_Rep`, `Deal_Status`, `Pipeline_Stage`

Current code uses lower snake-case API fields and also stores operationally useful business fields required for Quote/QR history, e.g. quotation snapshot, payment amount/status, root message IDs and CASE/MESSAGE tracking.

Recommended alignment while still keeping **exactly 3 tables**:
1. Use the customer-visible field names where they are part of the SRS.
2. Add only necessary supplemental fields inside those same three tables for the implemented workflow (quotation snapshot/payment state/routing metadata) rather than creating Product/Quotation tables.
3. Prefer backend-calculated IDs/state where Lark formulas/links create brittle setup dependencies.
4. Create a schema mapping document before creating the Base so code and UI names cannot drift.

## Quote requirement interpretation

The customer SRS says `[ส่งใบเสนอราคา (Flex)]` is one-click, but no Product table/catalog is specified. Therefore the practical accepted flow remains:

`click Quote → manual Lark form → Preview/Confirm → save Sales_Deals snapshot → send LINE Flex`

This is still a one-click entry into the quote workflow, not an impossible auto-quote with no price source.

QR remains:

`click QR → load persisted latest quote/deal amount → Preview/Confirm → generate PromptPay QR → LINE`

## Required implementation order before creating the customer Base

1. Adopt this SRS as the customer requirements baseline.
2. Resolve/implement team Thread collaboration model while preserving one case owner.
3. Add root-chat warning guard.
4. Add required 2-way media types and tests.
5. Expand close-command parser safely.
6. Add configurable VIP upgrade policy.
7. Add <=5m SLA label/fields.
8. Add broadcast alias, LINE-user validation and safe fallback semantics.
9. Produce final 3-table schema mapping using customer field names + required supplemental fields.
10. Run CI/typecheck/unit/bundle gates.
11. Only then create the Lark Base and execute controlled real E2E.

## Current rule

Until the above gaps are closed, do **not** create the final customer Base from the old `docs/lark-base-schema.md` unchanged. The schema must first be reconciled with the customer SRS.
