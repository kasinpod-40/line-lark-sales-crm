# Single-Stack Delivery Model

Status: LOCKED — 2026-08-22 (ICT)

This project does **not** use separate DEV, UAT, STAGING, or PROD environments.

There is one final customer-facing integration stack. Local development and GitHub CI are verification gates only; they are not runtime environments.

## Final stack — create once

Provision the real target resources once:
- one Lark Base with exactly `Customers`, `Chat_Tracking`, `Sales_Deals`
- one Lark App/Bot and one final Sales Inbox group
- the real LINE OA Messaging API channel
- one Cloudflare Worker
- one D1 database
- one R2 media bucket
- one Queue and one DLQ
- optional Workers AI binding

Do not create a second copy for DEV/UAT and do not plan a later data/resource migration into another environment.

## Delivery order

1. Finish code and documentation in the repository.
2. Require exact-HEAD GitHub CI success before touching the live integration target.
3. Create the final Lark Base and Cloudflare/Lark resources once.
4. Apply D1 migrations once and in order.
5. Configure final IDs, bindings, secrets, PromptPay target and public Worker URL.
6. Keep external event traffic disconnected or disabled while configuration is incomplete. Configure/enable the LINE webhook and Lark callbacks only after the final target is ready for the controlled test.
7. Execute the controlled E2E directly on this same final stack.
8. If an E2E step fails, fix only the root cause in code/config, pass CI again, then rerun the affected controlled flow on the same stack. Do not create a temporary environment.
9. When all acceptance flows pass, retain the same resources as the live operating system. There is no promotion/copy/migration step to another environment.

## Test data

Controlled E2E may create clearly identifiable test customer/case/deal records in the final Base. Clean or retain them according to business preference after acceptance, but never use a separate UAT Base solely for testing.

## Safety rules for a one-stack project

Because there is no lower environment:
- CI/typecheck/unit/bundle gates must be green before external setup or runtime changes.
- financial actions remain Preview/Confirm and idempotent.
- webhook redelivery, Queue retry, Card action dedupe and campaign retry keys remain enabled.
- root-chat isolation remains mandatory.
- schema changes after first live E2E must be controlled migrations, not manual ad-hoc field renames.
- do not delete/recreate the final Base or Cloudflare state merely to make a test pass; diagnose and repair the root cause.

## Terminology

Use these terms in project docs:
- `code-complete` = repository implementation and CI gates complete
- `final stack` = the single real LINE/Lark/Cloudflare target
- `controlled E2E` = acceptance test executed on that same final stack
- `live-ready` = controlled E2E has passed and the same stack is retained for operation

Avoid describing this project as DEV → UAT → PROD because that lifecycle does not exist here.
