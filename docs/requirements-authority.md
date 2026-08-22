# Requirements Authority / Precedence

Status: LOCKED — 2026-08-22 (ICT)

## Chronology

1. Customer SRS & SOW was created first.
2. PM later sent a concise summary of the **5 main functions** and explicitly linked back to the full SRS & SOW.

Therefore the PM message is **not a separate earlier scope** and the SRS is **not a later scope expansion**.

## Correct interpretation

- The PM 5-function message is the latest **executive / acceptance-priority summary** of the project.
- The full SRS & SOW remains the **detailed specification** behind that summary because the PM explicitly references it.
- Requirements that appear only in the SRS are not automatically deleted merely because the PM summary is shorter.
- When PM summary and SRS describe the same behavior, use the PM wording to understand the intended business outcome and the SRS for detailed acceptance/security/media/reliability behavior.
- If there is a true conflict, the later PM clarification controls the business behavior unless the customer/PM explicitly says otherwise.
- Engineering implementation prescriptions in the SRS may be replaced by technically equivalent or stronger cloud-native implementations when the required outcome/security/reliability is preserved (for example D1 distributed locking instead of process-local Promise locks on Cloudflare Workers).

## PM 5 top-level acceptance functions

1. Customer notification Card + AI intent/lead quality + atomic Claim Case.
2. One-click sales tools: quotation workflow and PromptPay QR delivery to LINE.
3. Smart Deal Closing: `ปิดยอด <amount>` → confirmation/payment message → `Sales_Deals` → Active Customer.
4. Executive Post-Case Analytics: Case SLA + Sales cumulative Closed Won amount/count on the resolved Card.
5. CRM segmented multicast: `ยิงโปร vip` / `ยิงโปร retarget` from Lark to selected LINE customers.

These five functions are the primary business acceptance view.

## SRS details that remain relevant under those functions

Examples include:
- customer identity/session tracking
- Card live-sync/callback behavior
- strict Thread isolation / root-chat safety
- collaborative team reply behavior
- 2-way media requirements
- Smart Deal command variants / VIP handling
- explicit SLA threshold/label
- multicast validation/retry/fallback semantics
- security/reliability/observability requirements

These are detailed requirements supporting the five top-level functions unless explicitly superseded.

## Schema naming decision after customer documents

All Lark Base field/API contracts use **lower snake_case** regardless of TitleCase names shown in the customer document. Table names remain:
- `Customers`
- `Chat_Tracking`
- `Sales_Deals`

See `docs/schema-naming-convention.md`.
