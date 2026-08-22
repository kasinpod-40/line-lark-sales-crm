# Customer SRS Gap Analysis

Status date: 2026-08-22 (ICT)

Sources:
- `docs/customer-srs-sow-2026-08-22.md` — full detailed SRS/SOW, created first.
- PM 5-function summary — sent later and explicitly linked back to the full SRS.
- `docs/requirements-authority.md` — locked interpretation of precedence.

## Executive interpretation

The full SRS was **not** introduced after the 5-function scope. The chronology is the opposite: SRS first, PM summary later.

Therefore:
- The PM 5-function message is the latest executive/acceptance-priority summary.
- The SRS remains the detailed specification behind it because the PM explicitly links to it.
- The current code already covers most of the five PM-level business functions.
- Remaining items below are **detailed SRS coverage gaps**, not newly introduced later scope.

## PM 5-function coverage

### 1. Customer Card + AI + Claim
Implemented at core level:
- signed LINE webhook + Queue
- customer/profile resolution
- AI intent/lead signals
- blue new-case Card
- atomic Claim Case
- live owned/green Card state

Detailed SRS gaps under this area:
- align Technical Support / Demo labels and actionable guidance wording where required
- finalize collaboration/security behavior described in SRS module 4

### 2. Quote + PromptPay QR
Implemented at core level:
- manual Lark quote form because no Product table exists
- Preview/Confirm
- quotation snapshot persisted in `Sales_Deals` before LINE outbound
- LINE Flex quotation
- QR amount loaded from persisted deal/quote
- PromptPay payload + high-resolution PNG
- Preview/Confirm before send

Interpretation of “1-click”:
- one click enters the sales action workflow
- the system cannot know product/price automatically without a product/catalog source

### 3. Smart Deal Closing
Implemented at core level:
- `ปิดยอด <amount>` command
- confirmation before mutation
- Closed Won / Paid state
- Active Customer update
- payment confirmation to LINE
- direct-close snapshot if no quote exists

Detailed SRS gaps:
- additional safe command variants such as `ยอดเงิน 150000`
- bare numeric command only with unambiguous case context + confirmation
- configurable VIP auto-upgrade thresholds; never invent Gold/Diamond thresholds

### 4. Executive Post-Case Analytics
Implemented at core level:
- First Response timing
- Resolution timing
- Sales Closed Won aggregate amount/count
- same root Card becomes resolved report

Detailed SRS gap:
- exact SLA label rule such as <=5 minutes = Fast and overdue representation

### 5. CRM Multicast
Implemented at core level:
- VIP/retarget commands/actions
- Preview/Confirm
- segment recipient snapshot
- multicast batches max 500
- deterministic retry keys + D1 batch state

Detailed SRS gaps:
- additional command alias if required (`บรอดแคสต์`)
- strict LINE user ID validation
- safe multicast failure fallback/recovery observability
- do not represent retries as a guarantee of 100% end-user delivery

## Detailed SRS gaps still requiring engineering work

### GAP-A — Collaborative Thread permissions
SRS says Sales, Specialist and Manager can collaborate in the same case Thread and customer-facing replies should reach LINE.

Current code is owner-only for Thread → LINE.

Target interpretation:
- one owner remains authoritative for case KPI and deal attribution
- authorized collaborators may reply if SRS behavior is retained
- actual responder is recorded per outbound message
- financial/ownership actions remain permission controlled

### GAP-B — Strict root-chat warning
Current routing is safe because only known case Thread replies are bridged.

Missing SRS behavior:
- when a real user types in the Sales Inbox root/group chat outside a case Thread, never bridge it to LINE
- post a visible warning telling the user to use Reply in Thread
- prevent warning echo loops

### GAP-C — 2-way media
Current:
- LINE inbound: text/image/sticker
- Lark → LINE: text

SRS detail requests broader two-way support:
- image JPEG/PNG
- PDF/file
- audio
- location/GPS
- sticker

Need API-supported mappings, size/type limits, download/upload adapters and tests.

### GAP-D — Smart command variants
Add safe parsing for SRS examples beyond `ปิดยอด <amount>` while always preserving confirmation before mutation.

### GAP-E — VIP progression
Need configuration-driven thresholds. If unset, preserve existing VIP status.

### GAP-F — SLA exact status
Add canonical backend/Base/Card representation for Fast/Overdue while keeping First Response and Resolution distinct.

### GAP-G — Broadcast validation/recovery
Add LINE ID validation, alias handling and observable safe fallback/retry behavior. Never claim guaranteed recipient delivery.

### GAP-H — AI labels/guidance
Align explicit business labels and actionable suggestion text where needed.

## Architecture interpretation

The SRS contains example implementation technologies. The required outcome/security/reliability is authoritative; a stronger/equivalent Cloudflare-native mechanism may replace server-process-specific wording.

Examples:
- D1 atomic uniqueness/locking instead of process-local `userCreationLocks` correctness authority
- public Cloudflare Worker HTTPS ingress instead of adding NGINX solely to match a diagram
- Queue retry/DLQ/idempotency instead of relying on `uncaughtException` / `unhandledRejection`
- Worker observability instead of durable local `logs/error.log` / `logs/combined.log`
- HTTP callback processing instead of WebSocket reconnect when WebSocket delivery is not used

## Lark Base

Still exactly three business tables:
1. `Customers`
2. `Chat_Tracking`
3. `Sales_Deals`

No Product or separate Quotation table is required for the current accepted flow.

All final field/API names use **lower snake_case** per `docs/schema-naming-convention.md`, regardless of TitleCase spelling in the source SRS.

Necessary Quote/QR/routing/AI/message-audit fields stay inside these same three tables where they are business data; operational idempotency/locks/retry state remains in D1.

## Before final Base creation

1. Preserve the already-working PM 5-function core.
2. Close the detailed SRS gaps that remain applicable.
3. Finalize the exact snake_case 3-table schema.
4. Run exact-HEAD CI/typecheck/tests/Wrangler dry-run.
5. Then create/configure the Base and run the real controlled E2E.
