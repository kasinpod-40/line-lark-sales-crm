# Golden Lark Base Provisioning

Status: READY FOR PERSONAL GOLDEN-STACK APPLY

This runbook creates the reusable three-table Lark Base contract in the owner's personal Lark workspace before the PM formally starts the project.

It does **not** create a DEV/UAT environment. The resulting Base is the private golden/reference installation used for full controlled E2E and effort measurement. When the PM starts officially, the same verified release/contract is installed or transferred to PM-controlled Lark while the existing owner Cloudflare stack remains in place.

## Source of truth

Human-readable schema:
- `docs/lark-base-schema.md`

Machine-readable schema:
- `deploy/lark-base-contract.json`

Provisioner:
- `scripts/provision-lark-base.mjs`

The machine contract uses the current Lark Base v3 field shape: `name` + string `type`, `select` with `multiple/options`, `number.style`, `link` with `link_table/bidirectional`, and `formula.expression`.

## Safety model

The provisioner is plan-only by default.

```bash
npm run lark:base:plan
```

Expected result includes:
- `mode: "plan"`
- `mutation_count: 0`
- exactly `Customers`, `Chat_Tracking`, `Sales_Deals`
- deferred formula creation order

No Lark API mutation occurs in plan mode and `lark-cli` does not need to be installed just to render the plan.

## One-time Lark CLI prerequisite

Apply mode uses the official `lark-cli` with explicit **user identity** because the Base belongs to the owner's personal Lark workspace.

Before apply:

```bash
lark-cli auth status --json --verify
```

The user identity must be authenticated and authorized for the required Base create/read/write scopes. If the CLI returns a missing-scope/authorization error, follow the exact `missing_scopes`, `hint`, and authorization URL returned by the CLI; do not switch silently to bot identity.

The provisioner suppresses update/skills notifier noise while parsing JSON, checks the CLI success envelope using `ok: true`, and never prints an app secret or access token.

## Create the golden Base

After plan review and Lark user authentication:

```bash
npm run lark:base:apply
```

Optional name override:

```bash
npm run lark:base:apply -- --base-name "LINE OA Sales CRM"
```

The apply path:

1. verifies `lark-cli` is installed and user auth is valid
2. creates one Base with `Customers` as the first table
3. creates `Chat_Tracking`
4. creates `Sales_Deals`
5. creates the bidirectional customer relations/backlinks
6. creates formulas only after all formula dependencies exist
7. re-reads the Base and refuses a final contract with extra/missing business tables
8. prints the four Worker variables needed for the Lark Base binding

The first field in every table is deliberately the primary field:
- `Customers.customer_id`
- `Chat_Tracking.tracking_id`
- `Sales_Deals.deal_id`

## Resume after a partial failure

The provisioner does not automatically delete a Base or rollback successful field/table writes.

If an apply fails after a Base token was created, fix the exact permission/schema/runtime cause and resume against the same Base:

```bash
npm run lark:base:apply -- --base-token <base_token>
```

Resume behavior:
- existing contract tables are reused
- missing non-primary fields are created
- existing deferred formulas are not duplicated
- a table with the wrong/missing required primary field is rejected instead of being silently rewritten
- an unexpected extra table is rejected by final verification

This preserves successful state and avoids destructive rebuilds merely to make a test pass.

## Expected successful output

Successful apply prints JSON containing resource IDs only, for example keys:

```text
base_token
worker_vars.LARK_BASE_APP_TOKEN
worker_vars.LARK_BASE_CUSTOMERS_TABLE_ID
worker_vars.LARK_BASE_CHAT_TRACKING_TABLE_ID
worker_vars.LARK_BASE_SALES_DEALS_TABLE_ID
```

These are then wired into the **existing owner Cloudflare stack**. The next Lark-side task is the owner-controlled App/Bot + Sales Inbox setup; external callbacks remain disabled until `/health` becomes ready.

## What this provisioner intentionally does not do

It does not:
- create a fourth business table
- create Product/Quotation tables
- create the Lark App/Bot
- create the Sales Inbox chat
- change Cloudflare resources
- enable LINE/Lark callbacks
- write real customer data
- store credentials in the repository

Those steps remain controlled separately in `docs/setup.md`.
