# Customer Deployment Model — Golden Stack → Customer Stack

Status: LOCKED — 2026-08-22 (ICT)

## Product intent

Build and finish **one complete reference/golden stack owned by us first**. This is the product template and acceptance reference.

When the product is sold to a customer, do **not** redesign or fork the business logic for that customer. Deploy the same verified product release and the same three-table Lark Base contract into the customer's own target resources, then supply only customer-specific configuration and credentials.

This is different from a DEV → UAT → PROD promotion ladder. Our golden stack is the finished product/reference. Each sold customer receives a separate installation of that finished product.

## Portable release contract

`deploy/product-manifest.json` is the machine-readable installation contract for the release. It locks:
- product/release identity
- exactly three Lark Base business tables
- D1 migration order
- required Cloudflare bindings
- Lark message resources as the media authority
- required/optional secrets and vars
- callback paths
- acceptance/setup documents
- anti-fork and naming rules

The manifest contains **names of configuration keys only**, never credential values.

## What is portable and should stay identical

The following should remain the same across our golden stack and every customer installation:

- application source code and verified release/SHA
- LINE webhook/event contracts
- Queue/D1 operational model
- Lark message-resource media authority + expiring D1-authorized Worker proxy
- Lark Case Card / Thread workflow
- AI intent/lead contract
- Quote / PromptPay / Smart Close workflows
- SLA and executive analytics logic
- Broadcast engine and safety rules
- Lark Base schema contract with exactly:
  - `Customers`
  - `Chat_Tracking`
  - `Sales_Deals`
- lower `snake_case` field/API naming
- D1 migrations and runtime safety/idempotency rules
- deployment-readiness validator and `/health` semantics
- controlled installation/E2E checklist

R2 is not required by release 0.3.0. Do not add a per-customer R2 bucket unless a later explicit product requirement needs independent object storage.

## What changes per customer

Only configuration/resource identity should vary, for example:

- LINE Channel Secret / Access Token
- Lark App ID / App Secret / verification/encryption values
- Lark Sales Inbox chat ID
- Lark Base app token and the three table IDs
- PromptPay recipient/configuration
- company/brand display name
- customer-specific VIP thresholds
- Cloudflare Worker/D1/Queue/DLQ resource IDs/names if deployed in the customer's account
- AI model/binding settings if the customer environment differs

No customer credential, Base ID, chat ID, PromptPay target, or deployed resource ID may be hard-coded into application source.

## Customer installation target

Preferred commercial handoff is customer-owned or customer-controlled resources where practical:

`Customer LINE OA + Customer Lark + Customer Base + Customer/managed Cloudflare Worker/D1/Queue/DLQ`

The repository remains the reusable product source. Deployment values are supplied through environment variables, secrets, bindings, and provisioning output. Customer-facing files remain in Lark message resources; D1 stores only technical state and expiring media-proxy metadata.

## Installation lifecycle for each sold customer

1. Select the verified product release/SHA and matching `deploy/product-manifest.json`.
2. Create the customer's final Lark Base from `docs/lark-base-schema.md`.
3. Provision the customer's Worker/D1/Queue/DLQ and Lark App/Bot integration.
4. Apply D1 migrations in manifest order.
5. Inject customer-specific secrets/vars/bindings; never edit source just to change IDs or credentials.
6. Call `/health` before enabling callbacks. It must return HTTP 200 with `configuration.ready=true`; HTTP 503 means configuration still has a blocking issue. Health output must never expose credential values.
7. Connect the customer's LINE OA and Lark callbacks only after configuration is complete.
8. Run the same controlled E2E checklist from `docs/setup.md` against that customer's final installation, including the Lark-backed media proxy path.
9. Fix reusable product defects in the main codebase, not as an undocumented one-off customer patch.
10. Keep customer-specific business configuration outside reusable core code wherever possible.

## Golden-stack rule

Our own completed stack is the canonical reference for expected behavior, not a disposable DEV environment. Once it passes the controlled E2E it should remain usable as:

- product demo/reference
- regression/reference behavior target
- installation blueprint
- source for screenshots/training material

Do not mix real customer data or credentials into the golden stack.

## Anti-fork rule

Avoid per-customer code forks such as:

- `customer_a_branch`
- hard-coded table IDs
- hard-coded LINE user/channel IDs
- customer-name conditionals in business logic
- duplicated Quote/Deal/Card engines

If a customer needs a legitimate product variation, add it as a documented configuration/feature option in the reusable product where feasible.

## Definition of reusable-ready

The product is reusable-ready when:

- golden stack passes controlled E2E
- source contains no embedded deployment credentials/resource IDs
- all required customer-specific values are represented as secrets/vars/bindings/config
- `/health` rejects missing/placeholder/invalid critical deployment configuration before callbacks are enabled
- Base schema and D1 migrations are deterministic and documented
- Lark-first bridge media works without an R2 dependency
- `deploy/product-manifest.json` matches the verified release
- a fresh customer installation can be created from the repository + setup docs without rediscovering architecture decisions
