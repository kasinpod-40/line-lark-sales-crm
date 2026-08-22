# Single-Stack Delivery Model

Status: LOCKED — 2026-08-22 (ICT)

This project does **not** use a DEV → UAT → STAGING → PROD promotion ladder.

The rule is **one runtime stack per installation**. Local development and GitHub CI are verification gates only; they are not runtime environments.

## Product build chronology

The product is intentionally being completed privately before the PM formally starts the project. This gives us real implementation evidence, removes approval waiting time during the official schedule, and avoids rushing once the PM/customer clock starts.

The chronology is:

1. **Private prebuild / golden reference** — build and fully test the product in the owner's personal Lark workspace using owner-controlled Lark/LINE/Cloudflare resources.
2. **Official PM handoff / presentation installation** — when the PM formally starts the work, put the same verified release under PM-controlled Lark resources so the PM can demonstrate/present it to the customer.
3. **Customer installation** — when sold/approved for the customer, install the same verified product release into customer-specific resources.

These are not DEV/UAT/PROD environments and there is no code promotion ladder between them. They are separate ownership/install targets of the same reusable product release.

## Golden/reference installation

The private golden/reference stack contains:
- one Lark Base with exactly `Customers`, `Chat_Tracking`, `Sales_Deals`
- one Lark App/Bot and one Sales Inbox group
- our reference LINE OA Messaging API channel
- one Cloudflare Worker
- one D1 database
- one R2 media bucket
- one Queue and one DLQ
- optional Workers AI binding

It is used to finish the product, run the complete controlled E2E and retain a known-good reference behavior.

Do not mix real customer production credentials or real customer business data into this stack.

## PM handoff rule

When the PM officially starts the project, the goal is to give the PM a presentation-ready Lark installation without restarting development.

Use the same verified release, schema, migrations and workflow contract.

Preferred handoff order:
1. If the relevant Lark tenant/resource ownership model safely supports transferring control of the existing Base/App/Bot/Sales Inbox to the PM, transfer ownership/control without changing business logic.
2. If ownership cannot be transferred cleanly (for example because the PM is in another tenant or an app/resource is tenant-bound), create a fresh PM-controlled installation from `deploy/product-manifest.json`, `docs/lark-base-schema.md` and `docs/setup.md`.
3. Copy only required demo/reference records if presentation data is needed. Do not copy secrets, operational retry state, or customer credentials.
4. Replace only installation-specific secrets, vars, bindings and resource IDs.
5. Run the controlled E2E on the PM-controlled installation before the PM presents it.

The PM handoff is therefore a **product ownership/installation handoff**, not a DEV→PROD promotion.

## Customer installation rule

A sold customer receives a fresh customer-specific installation of the same verified product release. Do not fork the business logic merely because the resource owner changes.

Customer-specific values include LINE/Lark credentials, Base/table/chat IDs, PromptPay target, Cloudflare resource IDs and optional business thresholds.

## Delivery order for any installation

1. Select the verified product release/SHA and matching manifest.
2. Require CI success for that code-bearing release.
3. Create the Lark Base and Cloudflare/Lark resources for the target owner once.
4. Apply D1 migrations in manifest order.
5. Configure IDs, bindings, secrets, PromptPay target and public Worker URL.
6. Keep external event traffic disconnected/disabled while configuration is incomplete.
7. Require `/health` HTTP 200 with `configuration.ready=true`.
8. Enable the LINE webhook and Lark callbacks only when ready.
9. Execute the controlled E2E on that installation.
10. If an E2E step fails, fix only the root cause in reusable code/config, pass CI for code changes, then rerun the affected flow.

## Test data

Controlled E2E may create clearly identifiable test customer/case/deal records. Clean or retain them according to the purpose of that installation. Never use real customer data in the private golden/reference stack merely to prepare a demo.

## Safety rules

- CI/typecheck/unit/bundle gates must be green before runtime changes.
- financial actions remain Preview/Confirm and idempotent.
- webhook redelivery, Queue retry, Card action dedupe and campaign retry keys remain enabled.
- root-chat isolation remains mandatory.
- schema changes after successful E2E must be controlled migrations, not manual ad-hoc field renames.
- do not delete/recreate runtime state merely to make a test pass; diagnose and repair the root cause.
- PM/customer handoff must not introduce customer-specific branches or hard-coded credentials.

## Terminology

Use these terms:
- `code-complete` = repository implementation and CI gates complete
- `golden/reference stack` = our private owner-controlled completed reference installation
- `PM presentation installation` = PM-controlled installation of the same verified product used for official presentation/demo
- `customer installation` = customer-specific installation of the same verified product
- `controlled E2E` = acceptance test executed on the target installation
- `live-ready` = the target installation has passed its controlled E2E
- `reusable-ready` = golden/reference product has passed E2E and can be installed again from the documented release contract

Avoid describing this project as DEV → UAT → PROD because that lifecycle does not exist here.
