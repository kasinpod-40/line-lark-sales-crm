# PM Presentation Handoff Model

Status: LOCKED — 2026-08-22 (ICT)

## Purpose

The product is being completed privately before the PM formally starts the work. The private build is used to finish the engineering, discover real integration issues, and learn the real implementation time without waiting on PM approval for Lark app creation/permission changes.

## Phase A — private build now

Use the owner's personal Lark workspace/Base and owner-controlled Lark App/Bot for the first complete golden/reference installation.

Cloudflare is **not** temporary and is **not** replaced at PM handoff. The PM already uses the owner's Cloudflare account/resources, so the same verified Cloudflare side remains authoritative across the private build and PM presentation phase unless an explicit infrastructure decision changes it later.

Private-build target:
- personal Lark Base / personal Lark App/Bot
- owner Cloudflare Worker/D1/Queue/DLQ with dedicated project resources
- Lark message resources as bridge-media authority; no R2 requirement
- reference/test LINE OA and PromptPay configuration as appropriate for controlled E2E

## Phase B — when PM formally starts

The main ownership change is on the **Lark side** so the PM can control/present the solution to the customer.

Target transition:
- keep the same verified application release
- keep the same dedicated Cloudflare Worker/D1/Queue/DLQ where possible
- keep the same business logic and migration history
- keep the Lark-first media model; files remain Lark message resources and D1 holds only expiring proxy metadata
- move or recreate the Lark Base/App/Bot/Sales Inbox under PM-controlled Lark resources
- replace only Lark-specific app credentials, Base/table IDs, chat IDs, verification/encryption values, and any other resource identity that changes
- update Cloudflare secrets/vars to point to the PM-controlled Lark resources
- rerun readiness and the affected controlled E2E flows before customer presentation

If direct Lark ownership transfer is not cleanly supported, create a fresh PM-controlled Lark installation from the same verified release/schema/manifest instead of inventing a new implementation.

This is **not** a Cloudflare migration and not DEV → PROD promotion.

## Phase C — customer installation

A sold customer still receives the verified product blueprint. Whether Cloudflare remains owner-managed or becomes customer-controlled is a commercial/operational decision for that customer; it must not require a fork of the business logic.

The reusable contract remains:
- same verified release/SHA
- same three-table Lark Base schema
- same D1 migrations
- same Worker/D1/Queue/DLQ operational pattern
- same Lark-first media authority and D1-authorized media proxy
- same Card/Thread/Quote/QR/Deal/SLA/Broadcast behavior
- customer-specific identities and credentials via secrets/vars/bindings

## Key rule

For the PM presentation handoff, **Lark changes; Cloudflare stays the same** unless explicitly decided otherwise.
