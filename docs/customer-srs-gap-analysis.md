# Customer SRS Gap Analysis

Status date: 2026-08-22 (ICT)

Sources:
- `docs/customer-srs-sow-2026-08-22.md` — full detailed SRS/SOW, created first.
- PM 5-function summary — sent later and explicitly linked back to the full SRS.
- `docs/requirements-authority.md` — locked interpretation of precedence.
- `docs/single-stack-delivery.md` — locked delivery model: one final stack, no DEV/UAT/STAGING/PROD ladder.

## Executive result

The applicable PM + detailed SRS requirements have been closed at the **code-contract level**. The remaining gap is external runtime evidence on the final LINE/Lark/Cloudflare stack.

This document no longer treats the detailed SRS items as pending engineering features. They are now implemented and must be validated during the controlled E2E.

## PM 5-function coverage

### 1. Customer Card + AI + Claim — CODE COVERED

Implemented:
- signed LINE webhook + Queue ingestion
- customer/profile resolution
- AI intent, lead quality and actionable guidance
- blue new-case Card
- atomic Claim Case
- green owned Card
- one Case Owner for KPI/deal attribution
- authorized human collaboration inside the same Thread
- actual responder audit per outbound message
- strict root-chat isolation + visible orange warning

### 2. Quote + PromptPay QR — CODE COVERED

Implemented:
- manual Lark quotation form because no Product table exists
- Preview/Confirm
- quotation snapshot persisted in `Sales_Deals` before LINE outbound
- LINE Flex quotation
- Customer stage progresses to quotation-sent state
- QR amount loaded from persisted deal/quote
- PromptPay payload + high-resolution PNG
- Preview/Confirm before send

Interpretation of “1-click” remains:
- one click starts the sales action workflow
- no catalog/Product table exists, so price/item input must come from Sales

### 3. Smart Deal Closing — CODE COVERED

Implemented:
- `ปิดยอด <amount>`
- `ยอดเงิน <amount>`
- bare amount only as a context-gated candidate, never immediate financial mutation
- confirmation before mutation
- direct Closed Won snapshot when no quote exists
- Paid / Closed Won state
- Payment Confirmation to LINE
- Customer `🏆 Active Customer`
- configurable VIP Gold/Diamond thresholds
- preserve current VIP status when thresholds are unset

### 4. Executive Post-Case Analytics — CODE COVERED

Implemented:
- First Response timing
- canonical <=5-minute Fast / overdue SLA status
- Resolution timing kept separate from First Response SLA
- Sales Closed Won aggregate amount/count
- same root Card becomes grey/report-only when resolved

### 5. CRM Multicast — CODE COVERED

Implemented:
- `ยิงโปร vip`
- `ยิงโปร retarget`
- `บรอดแคสต์` menu/dispatcher path
- segment preview and explicit confirmation
- strict LINE user-ID filtering
- recipient snapshot
- asynchronous Queue dispatch
- multicast batches <=500
- deterministic retry keys + D1 batch state
- observable batch failures
- safe individual fallback for failed multicast batches

The implementation never claims guaranteed 100% end-user delivery because LINE reachability/block/account state is outside the bridge's control.

## Detailed SRS coverage matrix

| SRS area | Code status | Runtime evidence still required |
|---|---|---|
| Customer identity / duplicate-case race protection | Implemented | burst-message E2E |
| AI intent / lead scoring / guidance | Implemented | real message examples |
| Card blue/green/grey lifecycle | Implemented | Lark render + patch E2E |
| fast callback architecture | Implemented with immediate HTTP response + `waitUntil()` work | Lark callback timing E2E |
| multi-screen Card update config | Implemented | verify Lark behavior |
| collaborative Thread replies | Implemented | Sales/Specialist/Manager E2E |
| root-chat isolation warning | Implemented | root-message safety test |
| text bridge | Implemented | two-way E2E |
| image bridge | Implemented with native/fallback paths | size/type E2E |
| PDF/file bridge | Implemented with Lark native + LINE HTTPS-link fallback | PDF E2E |
| audio bridge | Implemented with compatibility fallback | MP3/M4A/unsupported-format E2E |
| location bridge | Implemented | coordinate E2E |
| sticker handling | Implemented as safe platform fallback where IDs are not interoperable | E2E |
| Smart close variants | Implemented | command E2E |
| Closed Won + Active Customer | Implemented | Base write/readback E2E |
| VIP progression | Implemented as config-driven | customer threshold values + E2E |
| SLA <=5m label | Implemented | Base/Card readback |
| Sales aggregate | Implemented | multiple Closed Won data E2E |
| broadcast segmentation | Implemented | real Base segment E2E |
| multicast <=500 / retry/fallback | Implemented | LINE API controlled failure/retry evidence |
| idempotency / redelivery | Implemented | webhook/Queue/action retry evidence |

## Architecture interpretation

The SRS includes example server technologies. Required outcome/security/reliability remains authoritative, but the implementation is Cloudflare-native:
- D1 atomic uniqueness/locking instead of process-local `userCreationLocks`
- public Cloudflare Worker HTTPS ingress instead of NGINX solely for SSL termination
- Queue retry/DLQ/idempotency instead of relying on Node process crash handlers
- Worker/Cloudflare observability instead of durable local `logs/error.log` / `logs/combined.log`
- HTTP callback delivery rather than introducing Lark WebSocket solely to match example architecture

## Lark Base

Exactly three business tables:
1. `Customers`
2. `Chat_Tracking`
3. `Sales_Deals`

No Product or separate Quotation table is required for the accepted flow.

All field/API names use lower `snake_case` per `docs/schema-naming-convention.md`.

Business relations/formulas and operationally required quote/QR/audit fields remain inside the same three tables. Dedupe, locks, retry, routing and expiring media state remain in D1/Queue/R2.

## Remaining work — runtime only

There is no separate DEV or UAT phase.

1. Provision the one final Lark/LINE/Cloudflare stack.
2. Create the three-table Base once from `docs/lark-base-schema.md`.
3. Configure final credentials/bindings.
4. Run the controlled E2E in `docs/setup.md` on that same final stack.
5. Fix only real integration mismatches if discovered; pass CI again before rerunning the affected flow.
6. When the controlled E2E passes, retain the same stack for live operation.

Therefore the current project gap is **external integration verification**, not an intentionally deferred feature backlog.
