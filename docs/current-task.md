# Current Task — LINE × Lark Sales CRM

Last updated: 2026-08-22 (ICT)

## Current Status

**PM 5-FUNCTION CORE IS IMPLEMENTED AND PREVIOUSLY VERIFIED; FULL DETAILED SRS COVERAGE STILL HAS GAPS BEFORE FINAL BASE/E2E.**

Important chronology correction:
- The full customer SRS & SOW existed first.
- The PM later sent the concise **5 main functions** and explicitly linked back to the full SRS.
- Therefore the SRS is **not a later scope expansion**. The PM message is the latest executive/acceptance summary of the same project, while the SRS remains the detailed supporting specification.

Read `docs/requirements-authority.md` before interpreting scope.

## Requirements authority

Primary business acceptance view (latest PM summary):
1. Customer Card + AI + atomic Claim Case.
2. Quote + PromptPay QR sales tools.
3. Smart Deal Closing → `Sales_Deals` + Active Customer.
4. Resolved Card → Case SLA + Sales cumulative revenue/deal count.
5. VIP / retarget CRM multicast.

Detailed SRS remains applicable for supporting behavior such as Thread security/collaboration, media, callback/reliability semantics, SLA labels, command variants and broadcast validation unless explicitly superseded.

## Last verified code layer

The code layer implementing the PM 5-function core passed GitHub CI before the requirements chronology correction.

Verified capabilities included:
- TypeScript strict typecheck
- unit tests
- LINE HMAC + Queue normalization
- LINE retry-key recovery
- AI/rule classification
- Quote calculation and manual quote flow
- Direct close-deal snapshot
- PromptPay payload/CRC
- Lark Card lifecycle
- Cloudflare Wrangler deploy dry-run bundle
- npm audit with 0 vulnerabilities in CI install

Do not infer that this proves every detailed SRS item. Any new code commit requires exact-HEAD CI again.

## Product / architecture lock

Customers remain in LINE OA. Sales/Support/Manager operate from Lark. One central Sales Inbox group contains one root Case Card per active customer case and the case Thread.

Target:
`LINE/Lark → Cloudflare Worker → Queue/D1/Workers AI → Lark Messenger/Lark Base/LINE API`

Layering:
`Route → Service → Core → Provider/Repository`

Cloudflare-native reliability remains authoritative where it is equivalent or stronger than server-process wording in the SRS:
- D1 atomic uniqueness/locking instead of process-local Promise lock authority
- Queue retry/DLQ/idempotency instead of long-lived-process crash handlers
- Worker observability instead of durable local `logs/*.log`
- HTTP Lark callbacks instead of WebSocket reconnect unless event-delivery strategy changes
- no NGINX requirement when the Worker itself is the public HTTPS edge

## Lark Base lock

Exactly 3 business tables:
1. `Customers`
2. `Chat_Tracking`
3. `Sales_Deals`

No Product or separate Quotation table for current scope.

All field/API contracts use **lower snake_case**. See `docs/schema-naming-convention.md`.

Quote remains:
`Lark Card → manual form → Preview/Confirm → save Sales_Deals snapshot → LINE Flex`

QR remains:
`latest persisted deal/quote amount → Preview/Confirm → PromptPay QR → LINE`

## Detailed SRS gaps still to close

These were not newly introduced after the PM message; they are detailed SRS requirements that the current code layer does not yet fully satisfy:

1. **Collaborative Thread reply model**
   - Preserve one case owner for KPI/deal attribution.
   - Allow authorized Sales/Specialist/Manager collaboration in the same Thread if required by SRS.
   - Record actual responder identity separately.
   - Keep financial/ownership actions permission-controlled.

2. **Strict root-chat warning**
   - Root/group messages outside a case Thread must never bridge to LINE.
   - Add visible warning directing users to Reply in Thread.

3. **2-way media coverage**
   - Current coverage is incomplete versus SRS for image/PDF-file/audio/location/sticker in both directions.
   - Implement supported cross-platform mappings and explicit unsupported/limit behavior.

4. **Smart close command variants**
   - Add safe variants such as `ยอดเงิน 150000`.
   - Bare numeric commands require unambiguous context + Preview/Confirm.

5. **VIP auto-upgrade**
   - SRS requires VIP progression but gives no thresholds.
   - Use configurable thresholds; if unset, preserve current VIP and never invent values.

6. **SLA exact presentation**
   - Add the agreed <=5m Fast / overdue representation while keeping First Response separate from Resolution Time.

7. **Broadcast hardening**
   - Add required command aliases if used.
   - Validate LINE user IDs.
   - Add safe multicast failure/fallback observability/recovery.
   - Do not promise 100% end-user delivery.

8. **AI label/action guidance alignment**
   - Align explicit Buy Intent / Price Inquiry / Technical Support or Demo / General Inquiry labels and actionable Card guidance where required.

## Next implementation order

1. Close detailed SRS gaps above without breaking the already-implemented PM 5-function core.
2. Reconcile final snake_case 3-table schema.
3. Add/extend unit and contract tests.
4. Run exact-HEAD GitHub CI including Wrangler dry-run and dependency audit evidence.
5. Only after code gates are green: create/configure Lark Base + LINE/Lark/Cloudflare resources.
6. Execute one controlled real E2E across the five PM acceptance functions plus detailed SRS guards/media/reliability requirements.
7. Only then mark Production-ready.

## Handoff read order

1. `AGENTS.md`
2. `docs/current-task.md`
3. `docs/requirements-authority.md`
4. `docs/customer-srs-sow-2026-08-22.md`
5. `docs/customer-srs-gap-analysis.md`
6. `docs/schema-naming-convention.md`
7. current PR #1 exact HEAD + CI for that exact HEAD

Never describe the SRS as a later scope expansion again; the PM 5-function message came after it and is the latest executive summary that links back to the SRS.
