# Cost Allocation Design (PSK-1846)

Status: v3 for product review (2026-08-24 — the nine open questions
resolved in design review, see §Decisions; v2 2026-08-23 after a code audit
of every caller the plan touches; v1 2026-08-20), amended through phase 4b
(the Cost Allocation Summary, 2026-08-24)
Context: PSK-1846 (Cost Allocations v1) and PSK-1892 (Berenberg HR file).
Prototype: `postsig-proto` branch `email-configuration-error` —
`components/contracts/CostAllocation.tsx`, `InvoiceCostAllocationReport.tsx`,
`AllocationRollupReport.tsx`. The prototype is a UI reference only; its data
handling (mock catalogs, ACL groups passed in as cost centers, contract value
derived from product fees) is not a spec.

## Problem

Contracts and invoices are billed at the contract level, but customers need
to attribute that cost internally to entities, business groups, divisions,
business units, departments, teams, cost centers, and individual users, then
roll it up the org tree and compare against budgets.

Three things stand in the way today:

1. **Allocation targets have no identity.** `org_employees` carries the HR
   levels as free-text columns (`entity`, `division`, `business_unit`,
   `department`, `team`, `cost_center`). Only Business Group has a table
   (`groups`). A department is the string `"Research"` on N employee rows.
2. **There is no tree.** PSK-1892 shipped the Berenberg import (#2102) with
   no migration; the hierarchy exists only as the union of per-employee
   paths. Nothing stores parent/child edges or the per-org level order.
3. **"Business Group" means two things.** `groups` is both the HR business
   group (`org_employees.group_id`, and a second copy on
   `contract_users.group_id`) and the ACL principal (`group_members`,
   `contract_acl_group`, `folder_acl_group`, `inv_*_acl_group`). The Owner
   tab's "Business Groups" field writes `contract_acl_group` with
   `perm = 'write'` — the same row the share dialog writes, and a row the
   `contracts_visible_to` gate treats as a read grant. Spend-by-business-
   group (`lib/v2/spend/grouping.ts` → `parseGroups`) reads those ACL rows
   and splits spend evenly across them. The Upload Active Users CSV
   (`components/contracts/UploadActiveUsersCSVButton.tsx`) silently mints a
   `groups` row for every unknown Business Group name it sees.

Prod data (2026-08-20) shows the two meanings already live in disjoint
customers:

| Org         | groups | ACL members / contract shares | employees with `group_id` |
| ----------- | ------ | ----------------------------- | ------------------------- |
| Berenberg   | 5      | 0 / 0                         | 1589 / 1589               |
| Causeway    | 6      | 0 / 12                        | 0 / 1                     |
| Birch Hill  | 1      | 5 / 30                        | 0 / 0                     |
| Demo/Dev/QA | 3–14   | both                          | partial                   |

Causeway's groups have zero members — they were created in one sitting via
the Owner tab as cost-owner labels. Berenberg's are pure HR. Birch Hill's
"Data Science" is both a real sharing group and a label on 30 contracts.

HR column fill rates vary widely, so the fallback story is real:

| Org       | employees | entity | group | division | BU   | dept | team | cost center |
| --------- | --------- | ------ | ----- | -------- | ---- | ---- | ---- | ----------- |
| Berenberg | 1589      | 1589   | 1589  | 1589     | 1549 | 1091 | 1232 | 1589        |
| Sucden    | 219       | 219    | 0     | 2        | 1    | 219  | 0    | 219         |
| D1        | 38        | 0      | 0     | 0        | 0    | 4    | 0    | 0           |

Berenberg: 75 distinct departments, 76 distinct (BU, dept) pairs — name
sharing across branches is rare but present.

## Goals

- Persist per-contract (and per-product) allocations as percentages against
  stable target identities; amounts are always derived.
- Give the HR levels a real tree with per-org level order, built from the
  employee roster, tolerant of ragged paths.
- One allocation resolver feeds the Cost Allocation tab, the Invoice Cost
  Allocation report, the Cost Allocation Summary, the monthly
  report's "Spend by Business Group", the contracts table column, exports,
  and MCP. **Spend by business group is one number everywhere.**
- Decouple `groups` from spend: after this work, `groups` is ACL-only.
- Degrade gracefully for orgs with a partial or empty hierarchy.

## Non-goals / decisions already made

- No bulk allocation import (Phil: separate story; BNB will adhere to a
  template).
- No org-structure editor beyond what the Owner tab / picker needs (see
  §Org unit creation).
- No migration of `org_employees.*` free-text columns to FKs in this ticket.
  The tree is built _from_ those columns; they remain the import target.
- The spend engine stays the single source of amounts (`lib/v2/spend`).
  Allocation never stores money.
- Prototype shortcuts explicitly not ported: ACL groups as cost centers,
  contract value = sum of product fees, the hardcoded `75250` fallback.
- **Business sponsor stays as-is.** Sponsors are accountability metadata,
  not cost attribution, and they cannot migrate into allocations: the
  schema allows one allocation per scope and the ACL backfill claims it (a
  contract with sponsors and groups would merge two independent 100%-splits
  into one, changing both numbers and breaking the monthly-report gate),
  and `business_sponsor` is free-text Json the Owner tab lets users type
  anything into, so values do not resolve to stable targets. The payer
  use-case is covered going forward by user-targeted allocation lines
  (PSK-1846's own "33% Aleks Smith" example). The sponsor spend view keeps
  `parseSponsors` + `splitEvenly` untouched. Giving the sponsor field
  stable identity (org-user refs instead of free text) is a follow-up
  ticket candidate, independent of this work. Direction (decision Q9):
  coexist now, retire later — the sponsor _field_ stays (accountability
  metadata), but the even-split sponsor _spend table_ is recorded as a
  retirement candidate in favour of the user-level allocation rollup once
  allocations are adopted; its own ticket, Phil's call after the BG trial.
  No further investment in the sponsor split path meanwhile.

## Schema

Four new tables. All carry `organization_id`; `data/superuser/**` access
must filter on it (service client bypasses RLS). All get
`audit_trigger_function()`. New functions pin
`SET search_path TO 'public', 'pg_temp'`. RLS mirrors `org_employees`
(org-member select, role 11/12 writes) except delete, which is role 11/12
rather than 12-only — replacing allocation lines and removing a scope are
ordinary editing (phase-2a decision).

Cross-table references use the composite tenancy guard the ACL tables
already use (`(organization_id, group_id) → groups(organization_id, id)`,
`folders_schema_5.sql`): `parent_id`, `org_unit_id`, `org_employee_id`, and
`contract_id` are all `(organization_id, x) → t(organization_id, id)`, so a
cross-org parent or target is a constraint violation, not an RLS gap.

### `org_units` — the HR tree

```
id              bigint identity pk
organization_id uuid not null → organizations
level           text not null  check in
                ('entity','business_group','division','business_unit',
                 'department','team','cost_center')
name            text not null
parent_id       bigint null → org_units(id)   -- null only for roots
created_at, updated_at
unique (organization_id, parent_id, level, name) nulls not distinct
check (level <> 'cost_center' or parent_id is null)   -- CCs always flat
```

FK behaviors as enforced: `parent_id` is ON DELETE CASCADE (deleting a node
takes its subtree), while `org_employees.org_unit_id` is NO ACTION — the
composite tenancy FK cannot SET NULL a single column, and the sync never
deletes, so a node with assigned employees simply cannot be dropped. Phase-2
note: the allocation-line and budget FKs to `org_units` must be
RESTRICT/NO ACTION so a node delete can never cascade away financial rows.

Identity is the **path**, not `(level, name)`. "Research" under US Large Cap
and "Research" under Wealth Management are two nodes. That is what makes
rollups correct and what gives the summary report its nested rows without
inference.

Identity amendment (2026-08-25, product call — "Division → Research means
the target was really Research"): path identity is softened to **refinement
identity**. Two nodes at the same level with the same name are the same
target when one path refines the other — every node of the shorter path
appears, in order, on the longer one. The upsert walk resolves each step
through that rule (`lib/v2/org-units/refinement.ts`): the exact-path node,
else the unique refining/refined candidate — a deeper node is used as-is, a
shallower one is re-parented under the step's parent (same id, so
allocations and budgets follow with it) — else a new node. Three guards
keep the hard cases split: same-name nodes on diverging branches
(Berenberg's 76 (BU, dept) pairs over 75 names) refine nothing; an
ambiguous match (two candidates) falls back to path identity; and a root
step never matches, because a path with no higher levels can be an explicit
clear (the business-group null override), not imprecision. Nodes forked
before this rule are handled by `scripts/cleanup-refined-org-units.ts`
(dry-run first): inert ghosts are deleted (employees re-pointed to the
survivor — the sync's own semantics), and any ghost carrying allocation
lines, budgets, or children is only reported — merge machinery gets built
if such a ghost ever exists, which pre-launch data says it should not.

`parent_id` is null only for roots — the org's top-most present level. Paths
are allowed to be ragged: an employee with a Division and a Department but no
Business Unit produces a Department node whose parent is the Division node.
Every non-root node still has exactly one parent.

`level = 'cost_center'` nodes are **not** part of the tree (always
`parent_id null`, excluded by the tree builder). Berenberg's cost center is
`"70133 - Sales Trading Equities LD"` — a code orthogonal to the org chart.

No link back to `groups`. The tree backfill seeds a `business_group` node per
`groups` row, and the later ACL backfill finds that node by normalized name
(the same matching `matchBusinessGroups` does today). The sync never renames
a node, so the names still agree when the second backfill runs; a
transitional `group_id` column would only exist to be dropped.

### `org_employees.org_unit_id`

```
alter table org_employees add column org_unit_id bigint null → org_units(id)
```

The employee's leaf node. Required because path identity means employees can
no longer be joined to nodes by column values. Enables "all employees under
node X" as a subtree query and makes `active_users` mode resolvable to the
tree.

### `contract_cost_allocations` — one per scope

```
id              bigint identity pk
organization_id uuid not null
contract_id     bigint not null → contracts(id) on delete cascade
product_id      bigint null → vendor_products(id)  -- null = whole contract
mode            text not null check in ('active_users','manual')
created_by, updated_by uuid → users
created_at, updated_at
unique (contract_id, product_id) nulls not distinct
```

`product_id` targets `vendor_products(id)` — the grain `contract_users.
product_id`, `ProductWithLineage.product_id`, and the engine's
`contractId:productId` key all use. (`vendor_products_details` is one row
per contract × product × year; it is the wrong grain for an allocation.)

A contract is either contract-scoped (one row, `product_id null`) or
product-scoped (one row per product). The app enforces the exclusivity; a
partial check is not expressible as a table constraint without a trigger and
the service layer is the only writer.

Invoices and amendments are contracts, so their overrides live here under
their own `contract_id`.

`mode = 'active_users'` stores **no lines**. It resolves live to the
contract's (or product's) current active users with an equal split. This
answers Phil's open question ("should changes to active users update the
allocation?") without a sync job or a coupled mutation: it is always current
by construction. Editing any percentage materializes lines and flips the mode
to `manual`.

`mode = 'manual'` is the only mode with lines. "Equal split" is a UI
affordance that writes equal percents; it is not a stored mode, so there is
no "equal ⇒ all percents equal" invariant to police and nothing to drift.

### `contract_cost_allocation_lines`

```
id              bigint identity pk
organization_id uuid not null
allocation_id   bigint not null → contract_cost_allocations(id) on delete cascade
org_unit_id     bigint null → org_units(id)
org_employee_id bigint null → org_employees(id)
percent         numeric(7,4) not null check (percent > 0 and percent <= 100)
check (num_nonnulls(org_unit_id, org_employee_id) = 1)
unique (allocation_id, org_unit_id), unique (allocation_id, org_employee_id)
```

Exclusive arc, same `num_nonnulls` pattern as `inv_kpi_value` /
`inv_reporting_request_kpi` (the `inv_kpi_custom` migration). Business Group
is a tree node, so the arc is two-way. Only percent is stored; allocations
are currency- and time-agnostic.

The 100% invariant is enforced in the service on save (tolerance 0.01), not
in the DB — a per-allocation sum constraint needs a deferred trigger and the
service is the only writer.

### `cost_allocation_budgets`

```
id              bigint identity pk
organization_id uuid not null
org_unit_id     bigint null → org_units(id)
org_employee_id bigint null → org_employees(id)
fiscal_year     int not null
amount          numeric(14,2) not null check (amount >= 0)
created_by, updated_by, created_at, updated_at
check (num_nonnulls(org_unit_id, org_employee_id) = 1)
unique (org_unit_id, fiscal_year), unique (org_employee_id, fiscal_year)
```

The prototype's budget has no period, but it is compared against date-ranged
spend, so it needs one (decision Q4). Fiscal year matches the engine's
fiscal bucketing and the org's `organizations.fiscal_year_start_month`
(read as `userMetadata.organizationFY`; it is a column, not an
`org_preferences` key). Currency is the org base currency (PSK-1796). No
proration in v1: a sub-year window compares against the containing FY's
whole budget (what the prototype did, with the year made explicit); a
window spanning FYs sums the FY budgets it touches.

## Tree construction and maintenance

### Per-org level order

`org_preferences` key `employees.hierarchy_levels`: ordered array of tree
levels, e.g. `["entity","business_group","division","business_unit",
"department","team"]`. Added to the typed key union and `DEFAULT_PREFERENCES`
in `app/lib/actions/org-preferences.ts`. Default when absent: canonical order
filtered to levels with at least one non-null value among non-deleted
employees (`deleted_at is null`, any `status` — inactive and on-leave rows
still shape the tree; only "stale" below is defined on active employees).
Business Group has no employee column post-cutover, so it counts as "in use"
when any `business_group` node exists OR any employee still carries the
legacy `group_id` — without the node check, a group created from the value
map before the first import would be dropped from every path.

`DEFAULT_PREFERENCES` carries the full canonical order because
`OrgPreferencesMap` is total; the derived filtered-to-levels-with-data
default lives only in `getOrgHierarchyLevelOrder`
(`lib/v2/org-units/sync.ts`). Every consumer — the tree builder, and the
phase-4 report slicer when it arrives — must read through
`getOrgHierarchyLevelOrder`, never `getOrgPreference` directly, or an org
with no stored preference sees every level instead of the ones in use. No
UI in v1.

### Upsert walk

For each employee write, take the employee's non-null tree-level values in
the org's level order and upsert a node at each step with `parent` = the
previous step's node. Set `org_employees.org_unit_id` to the last node.
During the initial backfill of existing rows, Business Group resolves
through the legacy `group_id` → `groups.name`; after the cutover the import
resolves business groups to nodes directly (§Employee import and
directory).

Post-cutover, the sync resolves each employee's Business Group in order:
the caller's node override (`businessGroupNodeIdByEmployeeId` — a write
that submitted the field; `null` clears, an absent entry preserves), else
the `business_group` node already on the employee's current `org_unit_id`
path, else the frozen legacy `group_id`. The middle step is what keeps a
no-override sync — MCP add-users, or any future writer that does not know
about groups — from silently dropping membership, which has no text column
to fall back on.

An employee whose tree-level values are all absent gets
`org_unit_id = NULL`, including clearing a previously set leaf — the walk
mirrors the columns; business-group membership still survives via the
no-submitted-node fallback above. A sync failure after a successful bulk
write propagates: the route reports failure and an idempotent re-upload
recovers. Leaf assignment does not touch `org_employees.updated_at`.

The walk lives **inside the data layer**, not in callers: one
`syncOrgUnitsForEmployees` in `lib/v2/org-units/`, called from every write
function in `data/superuser/org-employees.ts` — `addOrgEmployee`,
`updateOrgEmployee`, and `addOrgEmployees` (the CSV import's bulk path,
which has its own insert, `onConflict:'id'` upsert, and per-row fallback
branches). That covers every UI surface that writes employees:
`AddEmployeeDialog` (mounted from Settings › Employees, the contract tab's
`EmployeeAssignmentDialog`, and the inventory sheet), the contract tab's
`EditContractUserDialog` via `useContractUsers.handleUpdateUser`, and
`lib/v2/employee-import/service.ts`. `lib/settings/employee-form.ts` is the
zod schema, not a write path.

Two writers sit outside that module. MCP add-users
(`app/lib/mcp/add-users-to-contract.ts`) inserts/updates employees directly
and never writes `entity`, `business_unit`, `team`, or the business group —
it calls the sync too, and its walk is partial by construction (documented,
not fixed here). `removeEmployeeFromGroup`
(`app/lib/actions/organization-groups.ts`) nulls `group_id` directly; it is
removed in phase 1 (§Employee import and directory), so it never needs the
sync. A one-time backfill script walks existing rows.

A DB trigger was considered (one choke point) but the walk needs the per-org
level order from `org_preferences` and the `groups` name lookup; keeping it
in TypeScript keeps it testable and consistent with how the import pipeline
is built.

### Never truncate

Berenberg re-uploads weekly. The walk is upsert-only; nodes are never deleted
by the sync. A renamed unit leaves its old node behind with zero employees.
The UI marks nodes with zero active employees as stale in the picker and the
report; allocations and budgets pointing at them remain valid and editable.

UI amendment (2026-08-25, product call): the stale **badge** is removed from
every surface — picker, tab lines, and the summary report — as more
confusing than helpful. Staleness stays a derived data field on the summary
report's rows (`stale`, still returned by `get_allocation_rollup`), nothing
is hidden, and Q8's "Move allocations to…" follow-up is unaffected;
`staleTargetReason` and `PickerItem.stale` are gone with the badge.

Superseded by refinement identity (2026-08-25, §`org_units`): the
fork-on-fill-in behaviour below no longer happens — the walk re-parents the
existing node when a later upload fills in a missing level and attaches
short-path employees to the refined node, so Q8's stale marker and the
"Move allocations to…" follow-up are moot for level fill-ins. Renames and
true restructures still leave their old node behind, deliberately. Kept for
the record:

Path identity has a second consequence: when a later upload fills in a level
that was missing (an employee first seen as Division → Department gains a
Business Unit), the walk creates a new Department node under the Business
Unit and the old Division → Department node goes stale. The sync does not
re-parent — the old node may legitimately hold other employees. Allocations
on the old node keep resolving to it and show as stale. Tested explicitly
(§Migration phases, phase 1). Decision Q8: the stale marker is the v1
answer — re-pointing is a normal manual edit; a "Move allocations to…"
one-click migration (stale node → same-name live twin, audited) is a named
follow-up ticket, and auto-migration on sync is ruled out as a background
financial mutation.

Staleness is derived at read time, never stored: a node is stale when no
active employee (`deleted_at is null`, `status = 'active'`) resolves to it
or any descendant. A node with empty direct membership but populated
children is not stale, and a stale node un-stales itself if a later upload
repopulates its exact path (the walk upserts — same node id, never a
duplicate). `getStaleNodeIds` counts `org_unit_id` leaf assignments only,
and cost-center nodes are never assigned as the leaf, so CCs always read
stale through it — cost-center staleness must be derived from
`cost_center` column values instead. Phase 2b: the picker derives it from
active employees' `cost_center` values matched to the node name (the
caller-supplied counts); phase 4 reuses the same derivation.

### Cost centers

`cost_center` values are upserted as flat nodes (`parent_id null`) by the
same walk, but are not assigned as the employee's `org_unit_id` and are
excluded from tree queries.

## Employee import and directory

The CSV import is the main writer of business-group membership, and today it
is also an ACL writer: `matchBusinessGroups`
(`lib/v2/employee-import/groups.ts`) matches values against the `groups`
table, and the value-map editor's "Create new group…"
(`components/settings/employee-import/ValueMapEditor.tsx`) calls
`createGroup` from `app/lib/actions/organization-groups.ts` — every new
business group in an HR file becomes a shareable ACL principal. That is the
coupling this design removes, so the import flips to `org_units`:

- `matchBusinessGroups` matches against `business_group` nodes (same
  normalized-name matching); the value-map editor creates a node, not a
  `groups` row.
- `lib/v2/employee-import/service.ts` stops writing
  `org_employees.group_id`; membership is carried by `org_unit_id` via the
  upsert walk. Same for the employee form and MCP add-users.
- The Employees settings page (`app/(app)/settings/employees/page.tsx`)
  passes business-group nodes instead of `getOrgGroups()` to the client for
  the add/edit dialogs and the import UI (`EmployeesPageClient` →
  `ImportEmployees` → `ColumnMappingStep` → `ValueMapEditor`, which keeps
  local group state that the create action appends to).

The writer flip forces every HR-sense consumer of `group_id` to repoint in
the same release — a node created by the import has no `groups` row, so
anything still reading `group_id` would silently miss it. The plumbing
funnels through a small set of choke points (traced 2026-08-23):

**Group lists** (what the dialogs' Business Group dropdowns show) — three
sources, all currently reading `groups`:

- Contract page: `server-components.tsx` calls `fetchOrgGroups`
  (`app/lib/sharing/actions.ts` → `getOrgGroups`) and threads it through
  `ContractDetailsWrapper` → `ConfigurableDetails` → `ActiveUsers` →
  `EmployeeAssignmentDialog`, and `ContractUsersByProductTable` /
  `ContractUsersTable` → `EditContractUserDialog` → `AddEmployeeDialog`.
  The same `fetchOrgGroups` result feeds the Owner tab's field.
  (`app/ui/contracts/details.tsx` is dead code — nothing imports it.)
- Inventory: `InventoryItemSheet` → `useOrgBusinessGroups`
  (`hooks/api/useOrgGroups.ts`) → `/api/v2/groups/org/:id` →
  `getOrgBusinessGroups` (`lib/v2/groups/service.ts`), then
  `UserManagementForm` (own group `<Select>`) → `UploadActiveUsersCSVButton`
  and `ContractUsersTable`.
- Settings › Employees: `page.tsx` → `getOrgGroups()`
  (`data/superuser/groups.ts`) → `EmployeesPageClient` →
  `AddEmployeeDialog` (which doubles as the employee edit modal via
  `openEdit`).

All three repoint to a business-group-node query in `lib/v2/org-units/`;
the `/api/v2/groups/org/:id` handler swaps its backing service, and now
403s an org id that does not match the session org — the node query runs on
the service client, so the swap removed the RLS that was silently doing
tenant isolation for the caller-supplied `:id`. The handler's other
consumer, `upload/CpmRowEditContext.tsx`, pairs the list with
`contract_acl_group` (ACL sense) and keeps `getOrgBusinessGroups`
directly. So do the MCP and chat `get_groups` tools
(`app/lib/mcp/tools/cpm/groups.ts`, `lib/v2/chat/tools/groups.ts`) — they
enumerate sharing groups and are unchanged; they will list memberless HR
groups after the cutover, which is accurate.

**Inline group creation** — the import's ValueMapEditor is not the only
ACL-minting path. `CreateGroupDialog` is embedded in `AddEmployeeDialog`
(the employee add/edit modal) and `UserManagementFormDialog`, and
`app/ui/contracts/owner.tsx` uses it for the Owner tab. In all
employee/allocation contexts these create a `business_group` node instead;
`CreateGroupDialog` itself survives only in Settings › Groups (ACL).
`UploadActiveUsersCSVButton` is a fourth path with no dialog at all: it
calls `createGroup` for every unknown name in the CSV. It switches to the
same node match/create.

**Employee writes** — `data/superuser/org-employees.ts` (§Upsert walk). The
Business Group field submits a node id; the row write drops `group_id` and
the upsert walk sets `org_unit_id`.

**`contract_users.group_id`** — a second HR-group store, not a dead
snapshot: `addContractUser` / `updateContractUser`
(`data/superuser/contracts.ts`), `useContractUsers` (add, and re-sync after
an employee update), and the CSV upload all write it, and the inventory
transforms read it rather than the `org_employees` join
(`lib/v2/inventory/transforms.ts`). It freezes in the same release: the
writers drop the field, and inventory reads the group through the
`org_employees` join the way the contract tab already does — literally:
`data/superuser/inventory.ts` turned out to be dead code (zero importers,
verified 2026-08-24), so the live sheet reads groups via `useContractUsers`
and the cached-snapshot fallback rows show no business group until the hook
loads. (Assigned employees already get `contract_users.group_id = null` and
rely on the join.)

Recorded decision: unlinked contract-user seats lose their business group —
the frozen snapshot is never read, so legacy unlinked rows display blank,
and the inline add-user form drops its group select (nowhere to persist the
value; the assign-employee flow is the only route that carries one).
Acceptable because `contract_users.group_id` is populated only in internal
orgs (Codoid 18 / Dev 10 / Demo 29; zero at Berenberg, Causeway, Birch
Hill).

**Read-only display and exports** — read the node name instead of
`groups.name`: `useContractUsers`'s employee join, `EmployeesTable` /
`ViewEmployeeDialog` / `EmployeeDetailsBody`, `ContractUsersTable` /
`ContractUsersByProductTable` / `ViewContractUserDialog`, inventory
transforms, the active-users CSV exports in `app/ui/contracts/active-users.
tsx`, `InventoryItemSheet`, and `export-inventory-active-users.ts`
(`user.groups?.name` today; `exportActiveUsersCSV` in `app/lib/actions/
contract.ts` labels the column `group_id` but carries the name), MCP
contract-users narration (`app/lib/mcp/contract-users.ts`), and the Groups
list page's `employeeCount` column (`orgColumns.tsx`, backed by an
`org_employees(count)` embed in `organization-groups.ts`), which is removed
with the rest of the groups-manage-employees surface.

Gate: a grep test asserting no non-ACL reader of `org_employees.group_id`
or `contract_users.group_id` remains.

Consequences:

- `org_employees.group_id` and `contract_users.group_id` are frozen (kept
  for rollback during the release, dropped at cleanup).
- Settings › Groups stops managing employees: `removeEmployeeFromGroup`, the
  group page's employee listing (`loadGroupEmployeeMembers`), and the list
  page's employee count are removed. Groups pages manage users and shares
  only.
- Existing `groups` rows (e.g. Berenberg's 5, now memberless) remain as
  plain ACL groups; deleting them is the customer's call.

## Allocation resolver

`resolveAllocations(contracts, ctx) → Map<contractId, { scopes:
ResolvedScope[] }>` where a `ResolvedScope` is `{ productId, mode,
sourceContractId, lines, unlinkedUserCount }` (phase-2a amendment: the v3
draft's flat `Map<contractId, ResolvedLine[]>` cannot carry product-scoped
allocations or the unlinked-seat count). A `ResolvedLine` is
`{ target: OrgUnitRef | EmployeeRef, percent }` and each ref carries the
node/employee id and display name (the contracts table filters on numeric
ids today).

The resolver runs **outside the engine**. `runPipeline` is synchronous and
pure — contracts in, line items out — and the engine's contract set is
Redis-cached per org × user × role × currency, so allocations never join
that select (every allocation write would otherwise need an org-wide
invalidation). Instead an `AllocationContext` is loaded once per query:
the org's `contract_cost_allocations` + lines, the `org_units` tree, the
hierarchy edges, and (for `active_users`) `contract_users` with
`org_employee_id` where `released_at is null`. The resolver is a pure
function over that context, so it is testable with fixtures and the same
map feeds the engine, the monthly report transform, the tab, and MCP.

Loader amendments (2026-08-25, after the post-4b audit): the design above
sized the context for report-shaped consumers and the single-record
consumers inherited it unchanged — one Cost Allocation tab load read every
allocation, line, unit, employee, and seat in the org (the roster twice,
relationships three times) to resolve one contract. Two changes, resolver
untouched:

- **Reads by need.** `loadAllocationContext` reads allocations, lines,
  units, and relationships up front, then seats only for contracts an
  `active_users` scope splits over and employees only where a line or a
  loaded seat points (chunked `.in`). The resolver never looks anywhere
  else, so every consumer — the business-group stamp on every contract
  fetch included — stops paying for the roster.
- **`loadAllocationContextForContract`** (`context.ts`) for the tab, the
  Owner-tab field, the invoice sheet, and `get_cost_allocation`: walks the
  hierarchy edges above the one contract (same edge `HierarchyMap.parents`
  resolves, same parent-org filter as `fetchAllRelationshipsForOrg`), loads
  the chain's allocations and lines, the org tree, and the contract's own
  seats (the tab previews them whatever the mode). Resolves identically to
  the org-wide context for that contract; `__tests__/cost-allocation/
context.test.ts` pins the parity cases (multi-parent, billing/disabled/
  cross-org edges, inherited `active_users`, cycles).

Audit closed (2026-08-25, final PR): the tab's amounts now run the same
pipeline restricted to the contract's relationship family
(`getContractsList({ familyOf })` — connected component over hierarchy and
billing edges; cutoffs still read the unfiltered base; the family-parity
test pins stamps equal to the full run cent for cent). The picker catalog
became its own org-wide payload (`loadAllocationCatalog` →
`GET /api/v2/cost-allocation/catalog`), fetched only when the editor opens
and cached per org; the tab payload carries `hasAllocationTargets` for the
empty state instead. And the transport moved to `/api/v2` Hono handlers
(`app/api/v2/handlers/cost-allocation/`) with `apiClient` hooks —
`app/lib/actions/cost-allocation.ts` and its per-action envelope/auth
boilerplate are deleted; user errors map to 400/403/404 in one place;
the save's `revalidatePath` is gone (react-query owns those caches).
`createBusinessGroupNodeAction` (a mutation shared with the employee
dialogs and import) deliberately stays a server action.

Precedence per contract:

1. The contract's own `contract_cost_allocations` row(s).
2. Inherited via lineage: walk `HierarchyMap.parents`
   (`lib/inventory/hierarchyUtils.ts`, `buildContractHierarchyMap` /
   `findTopmostParent`) over `isHierarchyEdge` edges only — a `billing`
   parent names an invoice's additional payer, never its allocation source.
   Invoices (`isInvoiceType()`, which includes EA invoices; never a literal
   `type_id === 6`) and amendments both resolve to the **nearest allocated
   ancestor** (decision Q7) — one walk, no special case, and an override on
   a middle amendment flows to later ones rather than being skipped by a
   root-only rule. A multi-parent child takes the lowest-numbered parent, the
   engine's existing convention (`lib/v2/spend/members.ts`). Product-scoped
   allocations inherit by the same `vendor_products.id` on the ancestor;
   `vendor_product_lineage_events` are chain-wide cancellations, not
   ancestor links, and play no part in v1. A contract replaced through
   `contract_lineage_events` (PSK-1845) has no relationship edge and so
   does not inherit — it gets its own allocation or stays `unassigned`.
   The nearest allocated ancestor resolves as a unit: the descendant takes
   its whole scope set, and a product with no row on that ancestor stays
   unassigned — no per-product deep-merge across multiple ancestors
   (phase-2a decision).
3. `mode = 'active_users'` → equal split over the source contract's current
   seats (per product when product-scoped), each resolved to an
   `EmployeeRef`. A seat counts only when it is unreleased **and** its holder
   is an active employee: nothing releases a seat when someone leaves, so
   `released_at is null` alone kept allocating cost to departed people (QA
   2026-08-25). "Active" is `isActiveEmployee` — status `active`, not
   deleted — the same predicate the picker, the org tree, and the summary
   report's staleness rule use. Unlinked legacy `contract_users` (no
   `org_employee_id`) are excluded and the tab surfaces the count; inactive
   holders are excluded silently, since "link them to an employee" is not
   the remedy. An inherited active_users
   allocation splits over the **source** contract's seats — an invoice has
   no seats of its own (phase-2a decision).
4. Nothing → the engine's existing `unassigned` bucket so additivity holds
   (one key everywhere; the goldens already pin "Unassigned" rows).

Inheritance is **live** (decision Q1): changing a contract's allocation
re-allocates every un-overridden invoice under it, past or future. Simpler
than snapshotting, and the launch case wants it — allocations set up
mid-trial should apply to existing invoices. The invoice override is the
manual pin for a closed month; a bulk "lock period" snapshot is a possible
follow-up, not v1.

### Rollup to a level

`rollupToLevel(lines, level)`: walk each line's target up to its ancestor at
`level` (an `EmployeeRef` starts at the employee's `org_unit_id`). A line
that reaches no node at that level — its target sits **above** the level, or
its branch has none — lands nowhere and returns `target: null` (amended
2026-08-25, see §Phase-3b amendments; it used to stay on its own target as
_direct_ spend, which is what put people in the Business Group column).
`direct` now means one thing only: the line was allocated at that node
itself. An employee line whose leaf IS the requested-level node counts as
rolled, not direct — the spend came from below the node. This is the
direct-vs-rollup distinction the summary report needs, and it is also why
the summary report and the monthly report agree: they are the same rollup
at different levels. What a landless line means is the caller's decision:
labels drop it, money routes it to `unassigned`. The summary report's
"Outside hierarchy" row is unaffected — it routes on the per-target totals
and a per-view `placed` predicate, never on a ref the rollup hands back
(phase-2a decision).

`level = 'cost_center'` is the one non-tree level and has its own routing
(decision Q2b, product 2026-08-25 "let's do both"): a CC-targeted line is
_direct_ spend on its cost-center node; an employee line routes to the
node matching the employee's `cost_center` column value as _rolled_ spend;
tree-node lines (a department cannot map to one CC) and employee lines
with no cost-center value go to "Outside hierarchy". The AllocationContext
employee refs must carry the resolved cost-center node id for this
(loader extension, phase 4 — the only consumer).

Phase-4b amendment (built 2026-08-24): `buildAllocationContext` resolves
`AllocationEmployee.cost_center_unit_id` by exact name match against the
flat `cost_center` nodes — the sync stores the raw column value as the node
name and the picker's staleness rule matches the same way — and
resolver-built `EmployeeRef`s carry it as `costCenterUnitId` (absent on
picker/editor refs, which never enter a rollup). The 2a pin "cost centers
never roll" survives for CC-targeted lines, which still never roll to a
tree level; what changed is that employee lines now roll TO a cost center
at the cost-center level, and the rollup suite records the revision under
that name.

## Spend engine integration

Amounts already come from the engine everywhere that shows a business-group
number: the monthly report runs `querySpend` with `groupBy: 'contract'`
(`lib/v2/reports/monthly-report/engine.ts`) and `buildSpendByBusinessGroup`
(`transforms.ts`) splits those per-contract values across group keys in the
transform, because the report needs per-contract sub-rows under each group.
The engine's own `groupBy: 'group'` dimension has **no production caller**
— only the raw `/api/v2/spend` handler exposes it. What is duplicated is
the _split_, not the money, so that is what becomes shared:

- One shared split in `lib/v2/spend` (phase-3a amendment: shipped as two
  composable functions rather than one, so the engine and the transform can
  key differently): `allocationShares(lines, level, unitsById, keyOf?)` =
  `rollupToLevel` + merge-by-key (two lines rolling to one node become one
  share; empty lines → `[['unassigned', 100]]`), and
  `splitByAllocation(value, shares)` = the cents-preserving largest-remainder
  split over `[key, percent][]`, normalized by the shares' actual sum (a
  99.9999 total still splits every cent) and floored on the signed raw so
  equal shares reproduce `splitEvenly` cent for cent, negatives included.
  `splitEvenly` stays for the sponsor dimension.
- `groupBy: 'group'` is replaced by `groupBy: { kind: 'allocation', level }`
  where `level` is a tree level, `'cost_center'`, or `'user'`. `SpendGroupBy`
  becomes a string-or-object union; the string-equality dispatch sites in
  `pipeline.ts` (`=== 'product' | 'sponsor' | 'group' | 'contract' |
'vendor'`) become a discriminated switch, the `/api/v2/spend` schema's
  flat `z.enum` accepts the object form, and `buildRefs` emits node
  id → name refs (today `'group'` returns none because the key is the
  label). Phase-3a amendments: keys are prefixed — `unit:<id>` /
  `user:<id>` — because the `'user'` level puts employees and org units in
  one key space where a bare id would collide (`unassigned` stays verbatim;
  the goldens pin it); the resolved map enters as
  `SpendQueryOptions.allocations = { resolved, unitsById }` and is REQUIRED
  when the dimension is asked for — the engine throws rather than answering
  all-unassigned, so a caller that forgot to resolve cannot ship a silently
  empty report; the retired `'group'` string is simply no longer admitted by
  the zod schema (an ordinary 400 naming the invalid value — it never had a
  production caller). Whole-contract allocations split `placer.total`
  placements, product-scoped allocations split `placer.byProduct`
  placements per product (a contract carrying both a whole-contract row and
  product rows — a state the service never writes — takes the
  whole-contract row). Native-currency shares split over the same keys.
- `buildSpendByDimension` (the shared sponsor/group body in the monthly
  report transform, exported as `buildSpendByShares` for the equality gate)
  takes per-scope shares instead of `keysOf`: a `scopesOf(ec, productIds) →
{ productId, shares: [key, percent][] }[]`. The sponsor builder passes one
  whole-contract scope at equal shares (pinned equal to the old
  `splitEvenly` output, cent for cent); the group builder passes the
  resolver's business-group rollup keyed by node NAME. Phase-3a amendment:
  the scope shape exists because a product-scoped allocation must split each
  product's own month values — deriving product weights from fee proportions
  would silently disagree with the engine's allocation dimension — so
  `buildMonthlyValuesByContract` now also returns per-product month values
  from the same engine run (a `groupBy: 'product'` query per basis over the
  same memoized segments), and a product-scoped contract whose per-product
  values are unavailable degrades to one whole-contract Unassigned scope
  rather than dropping money. A line with no business-group ancestor (a
  target above the level, a ragged branch, a cost center, an employee
  outside the tree) reports under `Unassigned`, mirroring `rollupToLevel`'s
  landless rule and the engine's keying (amended 2026-08-25; it used to key
  by the target's own name, which printed people as business groups). This one change covers the report
  page, the Excel export (`app/lib/actions/export-monthly-report.ts`), and
  the MCP spend tool (`app/lib/mcp/tools/cpm/spend.ts`), which all consume
  that transform.
  `MonthlyReportClient.tsx` re-aggregates group rows client-side under a
  tag filter (`refilterParentRow`) and hands _those_ rows to the export —
  it sums rows, so it needs no allocation awareness, but the golden covers
  it.

`parseGroups`, `extractBusinessGroups`-as-spend-input, and the
`contracts.business_group` scalar fallback are removed from the engine, and
`SpendContractInput` drops its `contract_acl_group` / `folder_contracts`
pick. `scripts/monthly-report-shadow-diff.ts` imports `parseGroups` and
follows.

Consumers that move from `extractBusinessGroups` to the resolver's
business-group rollup (same derivation for all; ids and names, since the
contracts table filters on ids). **PSK-1975 (2026-08-28): every consumer
in this list now reads the contract's owners instead
(`contractOwners` / `ownerGroupRefs`, `lib/v2/owners`); the rollup stamp
and `business-group-rollup.ts` are gone, and the Business Sponsor column,
filter, exports and `groupBy: 'sponsor'` read owner sponsor rows, not
`contracts.business_sponsor`, which is frozen.**

- Contracts table column + filter: `lib/v2/contracts/transforms.ts` emits
  `businessGroups: {id, name}[]`; `ContractsTableClient.tsx` and
  `filterUtils.ts` consume that field unchanged.
- `app/lib/contracts/processing.ts` — a second copy of the ACL + scalar
  derivation on the legacy row builder.
- Inventory (`lib/v2/inventory/transforms.ts`)
- Exports (`lib/v2/reports/budget-export/rows.ts`,
  `app/lib/actions/export-report.ts`, `app/lib/actions/contract.ts`)
- MCP (`app/lib/mcp/tools/cpm/contracts.ts` — filter predicates and the
  `businessGroup` projection, both with scalar fallbacks today —
  `renewals.ts`, `resources/index.ts`)
- Chat (`lib/v2/chat/tools/resolve-entity.ts`,
  `lib/v2/chat/tools/queries/filters.ts`)

`extractBusinessGroups` is renamed `extractSharedGroups` (phase 3b). It keeps
the ACL one-hop semantics, but the audit found it has **zero production
importers**: the share dialog, folder UI, and visibility checks never read it
— only the spend-side consumers above did, and they now read the rollup. It
survives as the legacy oracle in
`__tests__/v2/budget-export-rows-business-group.test.ts` (the gate test
carries its own verbatim copy); `__tests__/mcp/update-contract-elicitation.
test.ts` no longer mocks it because the MCP module no longer imports it.
Deleting it is a cleanup candidate.

`contracts.business_group` had two writers: MCP `update_contract`
(`app/lib/mcp/update-contract.ts`), which set values, and the Owner tab's
`updateOwner`, which nulled it on every save. Phase 3b dropped both — the
MCP whitelist is `business_sponsor` and `tags` (zod strips a stray
`business_group`), and `updateOwner` no longer names the column. Zero writers
remain; the readers left are the backfill mirror (one-time) and two dead
functions (`getOwner`, `data/superuser/inventory.ts`).

Phase-3b amendments (built 2026-08-25; the stamp and derivation below were
replaced by the owners embed in PSK-1975 — see the note above):

- **One stamp, not threading.** `ContractBase.businessGroupRollup?:
AllocationTargetRef[]` is stamped by `stampBusinessGroupRollup` in
  `app/lib/contracts/actions.ts` at the five raw fetch wrappers
  (`fetchContracts`, `fetchContractsBase`, `fetchContractsBaseForLineageAI`
  — both cache paths — `fetchContractsById`, `fetchReportContracts`), AFTER
  the Redis contract-set read and never into it, so an allocation write
  still needs no org-wide invalidation. The context comes from
  `loadAllocationContextForRequest` (`context.ts`, React `cache()` keyed on
  the org) — once per request no matter how many wrappers run. Every
  consumer in the list reads the stamp through `businessGroupRefs` /
  `businessGroupNames` (`lib/v2/cost-allocation/business-group-rollup.ts`);
  an unstamped row (tests, paths outside those wrappers) reads as
  unassigned. `hasActiveContracts` (the login redirect) passes
  `skipAllocationStamp: true` — it never reads the column and is the hottest
  path in the app. Follow-up: on the v2 paths the loader fetches
  relationships a second time (the wrappers run before the services fetch
  theirs); threading them in means reordering the fetch sequence and
  widening a public server-action signature, so the duplicate query is
  accepted for now.
- **The derivation** (`businessGroupRollup`): every resolved scope's lines
  through `rollupToLevel('business_group')`, deduped by target. A line that
  lands nowhere at the level — a target above it, a ragged branch, a cost
  center, an employee outside the tree — is left out, so the column holds
  business groups or nothing. Inheritance follows the resolver; a seatless
  `active_users` scope reads empty.

  Amended 2026-08-25 (QA): `rollupToLevel` used to keep such a target as
  itself, which put allocated **people** in the Business Group column (and in
  the monthly report's rows) — most orgs have no business group on an
  employee's branch, and before `scripts/backfill-org-units.ts` runs no
  employee has a branch at all. The fallback now lives at the source:
  `rollupToLevel` returns `target: null`, and each consumer decides. Labels
  (contracts column + filter, inventory, exports, MCP, chat, the Owner tab
  field) drop it; money (`allocationShares`, so the monthly report and the
  engine dimension) merges it into `unassigned` — never dropped, since
  `splitByAllocation` normalizes by the share sum and a dropped line would
  hand its money to the groups that did land. The Summary report is
  unchanged: it already re-filtered `rollupToLevel`'s output to nodes at the
  requested level, and that hand-rolled guard came out. The column and the
  report still agree, they now agree on "nothing" / "Unassigned".

- **Ids are allocation keys.** `businessGroups[].id` is `unit:<id>` /
  `user:<id>` (the engine's key), not a number: the table filter dedupes its
  options on `id`, and a direct employee line can share a numeric id with a
  business-group node. The nuqs `group` param carries the key.
- MCP: `list_contracts` / `query_contracts` `business_group` filters match
  rollup names exactly (scalar fallback gone); the summary's `businessGroup`
  is the first rolled-up name; `get_contract` `ownership.business_group` is
  the rollup joined. `cpm://reference/business-groups` counts rollup names.
- `getGroupsWithContracts` stays ACL-sense, deliberately. Its only callers
  are the MCP and chat `get_groups` access views (paired with
  `getContractIdsForGroup` and `group_members`); no UI dropdown consumes it —
  the contracts-table filter derives its options from the rows'
  `businessGroups`. The v3 instruction to repoint it named a consumer that
  does not exist.

## Owner tab "Business Groups" field

> **Superseded by PSK-1975 (2026-08-28).** The field no longer reads or
> writes the allocation. Owners live in `contract_owners` (sponsors as a
> user / employee / label, groups as `org_units` at any level), embedded on
> every contract select and written only by `updateOwner` →
> `replaceContractOwners` (`lib/v2/owners/service.ts`). Ownership grants no
> access and attributes no spend; the Cost Allocation tab is the only writer
> of allocations. The ACL backfill's 129 assumed allocations are removed by
> `scripts/psk-1975-populate-owners.ts --delete`. Everything below this
> note describes the psk-1846 design it replaced.

The field becomes a view onto the allocation. It never writes ACLs.

- **Reads** the resolver's business-group rollup: each line walked up to its
  `business_group` ancestor, deduped. Same derivation as the contracts
  column.
- **Writes** a whole-contract `manual` allocation with one line per
  selected business-group node at equal percent.
- **Coupling rule**: editable only while the allocation is _simple_ — empty,
  or whole-contract lines over business-group nodes only, all at the same
  percent. Otherwise read-only with "Edit in Cost Allocation". No overwrite
  confirmations in either direction.

Group sharing lives only in the share dialog. Today the field is not merely
a duplicate of it: `updateContractBusinessGroups` (`lib/v2/groups/service.
ts`) diffs and deletes every `contract_acl_group` row not in the submitted
list, share-dialog rows included, and `removeGroupFromContract` ignores
`perm` while the PK includes it. The rewire ends that.

**Existing ACL rows are kept.** `contracts_visible_to` and the
`contracts_read` policy treat any `contract_acl_group` row joined to
`group_members` as a read grant, with no `perm` predicate, so the Owner
tab's `perm = 'write'` rows are live access for group members today. The
backfill snapshots them into allocations and leaves them in place as
ordinary shares; nothing is deleted. Birch Hill is the org this protects —
"Data Science" is both a sharing group and a label on 30 contracts, and
`perm` cannot tell the two origins apart (the dialog offers `write` too).
Causeway's rows grant nothing (no members) and are harmless.

Phase-3b amendments (built 2026-08-25):

- Reads and writes go through `app/lib/actions/cost-allocation.ts`
  (`getContractBusinessGroupField`, `saveContractBusinessGroupsAction`) and
  `hooks/api/useCostAllocation.ts` — the same `saveContractAllocation` writer
  and `manage Organization` gate as the tab; `updateContractBusinessGroups`
  (`lib/v2/groups/service.ts`) is retired from the owner path and survives
  only for the upload row editor's ACL edits. `useContractBusinessGroups`
  and the `contractACL`/`initialGroups` threading through
  `ConfigurableDetails` are gone.
- **Inherited allocations are read-only regardless of shape.** A field save
  must never convert inheritance into an own override — the Cost Allocation
  tab's explicit "Override" is the only route. So the simple rule is: empty,
  or the contract's OWN single whole-contract manual scope over
  business_group nodes at one percent (`isSimpleBusinessGroupAllocation`).
  The rule is re-checked on save, so a stale form cannot overwrite an
  allocation the field cannot represent.
- Writes use `businessGroupScopes`: truncated-equal percents
  (`equalSplitPercent`), lines in selection order; an empty selection clears
  the allocation. Backfilled and hand-saved contracts satisfy the same rule.
- "Edit in Cost Allocation" links to `?view=cost-allocation` and renders
  only when the org's `cost-allocation` flag is on (the tab is hidden
  otherwise); the field itself works regardless of the flag.
- Options are every `business_group` node (no same-name breadcrumb in this
  field — the picker's rule, decision Q3, is a follow-up here); "Create new
  business group…" creates a node via `createBusinessGroupNodeAction`, the
  same as the employee and allocation contexts.

## Backfill — monthly report must not change

One-time migration, run once per org, producing whole-contract `manual`
allocations at equal percent that reproduce today's `parseGroups` output
exactly:

1. Ensure a `business_group` root node exists for every `groups` row —
   including ACL-only groups like Causeway's and Birch Hill's, since that is
   what their monthly report shows today.
2. For each contract, resolve the legacy set with the **same one-hop
   derivation `extractBusinessGroups` uses** (direct `contract_acl_group` +
   the contract's own folder's `folder_acl_group` via `folder_contracts`;
   not the ltree ancestor walk `contracts_visible_to` does — the report
   never saw ancestor folders); else the `contracts.business_group` scalar
   (creates a node by name if missing; expect few, since the Owner tab has
   been nulling it); else nothing (stays `unassigned`).
3. Write one `manual` allocation with one line per resolved group at equal
   percent.

Phase-3a amendments, from building the backfill
(`scripts/backfill-cost-allocation-acl.ts`, a separately-run data pass —
never a migration, since local resets replay every migration; the original
migration file is kept as an empty stub so no environment needs a history
repair — driving
`deriveLegacyGroupBackfill` in `lib/v2/cost-allocation/legacy-backfill.ts`,
the ONE derivation both the backfill test and the gate harness consume,
verified line-identical against the original SQL over the full local
dataset):

- **Equal means truncated.** Lines get the numeric(7,4) floor of 100/n —
  33.3333 each, never 33.3334/33.3333/33.3333. Distributing the remainder
  units to sum exactly 100 gives the first group a genuinely larger share,
  which the secondary gate caught moving report cents (a cent per ~$10k of
  bucket value); the truncated sum (≥ 99.9993 for any realistic n) sits
  inside the service's 0.01 save tolerance, and "all at the same percent"
  keeps the Owner tab's simple rule true for backfilled contracts. Phase 3b
  made `equalSplitPercent` (`lib/v2/cost-allocation/percent.ts`) the single
  definition: the editor's Equal Split toggle and the Owner tab field write
  the same truncated shares.
- Node matching is by normalized name (trim + lower, `matchBusinessGroups`'
  rule) across ALL `business_group` nodes, lowest id winning; node names are
  stored trimmed; case-variant duplicate groups collapse onto one node (one
  line, not two keys as the raw legacy names produced). Whitespace-only
  group names resolve nothing — and still suppress the scalar, matching
  `parseGroups`' precedence.
- Lines are written in node-id order (nodes are created in normalized-name
  order — the SQL's DISTINCT ON forces it and the mirror matches), which
  places the odd cent deterministically where the legacy path followed the
  ACL rows' undefined fetch order. Same key set, same totals; the fixture
  gates align the two orders.
- Allocations are written for contracts of every status and type. A
  consequence of live inheritance (Q1/Q7): an amendment or standalone
  invoice with no ACL rows of its own, sitting under an ancestor the
  backfill allocated, moves from Unassigned to the ancestor's groups —
  intended resolver semantics, not a backfill defect; the gate fixture
  carries no lineage edges for exactly this reason.
- Second intended divergence (phase 3b): a scalar-only contract — one whose
  legacy set came from `contracts.business_group` — now shows its backfilled
  group in the budget export's Business Group column and everywhere else the
  rollup is read, where the ACL-only `extractBusinessGroups` column was
  blank. The report gates never saw a difference because `parseGroups`
  already read the scalar.

Gates, in order of what customers see:

- Primary: `buildSpendByBusinessGroup` old vs new over a fixture org with
  direct, folder-inherited, scalar-only, and unassigned contracts, asserting
  identical rows; the existing goldens
  (`__tests__/v2/__goldens__/monthly-report-goldens.json` `"group"` capture,
  `monthly-report-export-goldens.json` "Spend by Business Group" sheets) are
  pinned before and must not move.
- Secondary: the engine's legacy `groupBy: 'group'` vs
  `groupBy: { kind: 'allocation', level: 'business_group' }` over the same
  fixture, asserting identical per-period, per-key totals — proves the
  shared split is the same function.
- Coverage note (phase 3b): `budget-export-goldens.json` pins per-contract
  monthly values only — it has no Business Group column. That column is
  pinned by `__tests__/v2/budget-export-rows-business-group.test.ts`, which
  feeds ACL fixtures through the 3a harness and asserts the rollup column
  equals the legacy `extractSharedGroups` output for every ACL-derived
  contract.

The backfill is a snapshot. After it, sharing a folder or contract no longer
affects any allocation.

## Fallback matrix

"Which levels does this org use" is derived from data, never configured in
v1.

| Org state                            | Picker                                      | Owner tab field        | Summary report                                                            |
| ------------------------------------ | ------------------------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| Full tree (Berenberg)                | All levels, grouped, path breadcrumb        | Editable (simple rule) | Nested tree down to users; slicer over levels in use, Cost Centers, Users |
| Partial (Sucden: entity/dept/CC)     | Entities, Departments, Cost Centers, Users  | Hidden (no BG nodes)   | Entity → Department → User; CCs and Users flat                            |
| Groups only (Causeway post-backfill) | Business Groups, Users                      | Editable               | Business Group → User; Users flat                                         |
| Departments only                     | Departments, Users                          | Hidden                 | Department → User; Users flat                                             |
| Employees, no levels (D1)            | Users only                                  | Hidden                 | Flat list of users, no rollup column                                      |
| No employees, no groups              | Empty state → Settings › Employees / Groups | Hidden                 | Empty state                                                               |

Units with zero active employees are shown as stale, not hidden.

### Org unit creation

Business-group nodes normally come from the roster, but Causeway's pattern
(1 employee, 6 groups created purely as labels) shows orgs need a way to get
a node without an HR import. v1: "Create business group" inline from the
Owner tab field and the allocation picker (name only, root node). A small Org
Structure section under Settings › Employees is a follow-up.

## Contract tab behaviour (from the ticket and prototype)

- Scope chooser (Entire Contract / By Product) only when the contract has 2+
  products; single-product contracts go straight to contract scope.
- Picker: browse by level — every tree level with data, **Division
  included** (decision Q6; the prototype's omission was an oversight) —
  search across all. A muted parent-path breadcrumb appears only when two
  nodes share a name at that level ("Research · US Large Cap"), decision Q3.
  "Add all active users (N)" is a button beside the picker, not a row inside
  its Users list (product feedback 2026-08-25: for a contract with active
  users it is typically the first action, and the prototype had buried it
  two levels down); it stays visible but disabled once every seat holder is
  selected, is hidden while the scope is in sync mode, and the empty table
  names it.
- Percentage and amount inputs select their content on focus and drop a
  leading zero as you type: a fresh line reads "0", and appending to it
  produced "05" (QA 2026-08-25).
- The Users category offers **all active org employees** (decision Q5), so a
  cost owner who holds no seat can be a target; "Add all active users"
  remains the shortcut for the contract's seat holders. Inactive/departed
  employees drop out of the picker, and out of the shortcut and the
  `active_users` split with it — `seatHolderTargets` used to re-admit an
  off-catalog holder under the seat's own name, which is how the button
  labelled "active users" added departed ones (QA 2026-08-25). Existing
  lines pointing at them stay valid and keep resolving.
- Method toggle Equal Split / Manual; editing a percent or amount flips to
  Manual. Amount edits convert to percent against the scope's displayed
  value.
- Save gated on each populated scope totalling 100%. Running total percent
  and amount per scope.
- Displayed amounts come from the engine-stamped contract set
  (`getContractsList` with `productValues`) in the org's base currency:
  contract = current-FY commitment (`currentBase`), invoice = recorded
  amount (`recordedBase`), product = for a contract the native product
  stamp at the contract's effective rate; for an invoice its own recorded
  per-product fees (its `vendor_products_details` rows, what the engine's
  native read books for it) at the recorded base/native rate — never the
  current-window product stamps, which are zero for every invoice outside
  the window (QA 2026-08-25). These are the values the contracts and budget
  tables show, so the tab and the reports agree. The contract Overview
  cards carry no money figure. Three states (product rulings 2026-08-25):
  a record with a **recorded** fee reads its stamps as they are — a zero
  window, a superseded or never-priced product, a zero fee all read as
  zero on every scope, exactly as the engine stamps them (`?? 0`) and the
  contracts/budget tables print them; a record **in the set with no fee
  recorded** (no rows, or only null fees — the engine stamps 0 for it, but
  that is the absence of data, not a price) has no value of its own; and a
  record **absent** from the set (archived, filtered out) has none either.
  "No value of its own" renders "—", never a false zero — unless the
  allocation is inherited and the source contract is in the family set,
  in which case the tab and the sheet price the inherited scopes from the
  source and say so ("Amounts shown are from …"): QA's no-fee amendments
  show their parent's amounts. "—" only when neither has a value. The
  invoice report's rows deliberately do not fall back — an invoice with no
  recorded amount lists "—", not its parent's commitment. The tables
  printing $0 for "nothing recorded" is a later, app-wide revisit.
- Editing requires `manage Organization` (roles 11/12 — the RLS gate;
  `update Contract` would exclude role 11); read-only while viewing an
  original version.
- Audit: `ContractActivityType.ALLOCATION_CHANGED` with before/after lines
  in `activity_data` (jsonb), shown in the contract History tab, plus the
  table-level audit trigger. Four coordinated edits: the enum,
  `ActivityDataMap`, `getActivityDataType` (`constants/types.ts`), and
  `CONTRACT_DETAIL_ACTIVITY_TYPES` (`lib/v2/contracts/activities.ts`) —
  without the last it does not render. Written through
  `logContractActivity` (`data/superuser/activities.ts`) like the other
  typed wrappers. Target and product names for the History row are
  resolved when the tab loads (`attachAllocationActivityNames`);
  `activity_data` keeps ids only.
- Any record whose allocation resolves by inheritance (invoices,
  amendments) opens the same tab read-only with the inherited allocation
  and its source, plus an "Override for this …" action that creates the
  record's own row; "Remove override" restores inheritance.
- An inherited by-product allocation shows only the scopes for products
  the record carries (`applicableScopes`, editor.ts — the tab, the report
  row, and `get_cost_allocation` share it): a child billing a subset of the
  parent's products takes just the matching scopes, as the engine attributes
  a segment through its own product's scope and never reads the rest. QA
  2026-08-25: the parent-only scopes had rendered as "Product #<id>" tables.
  A record carrying none of the allocated products says so instead of
  reading as unassigned; whole-record scopes always apply.
- An unassigned invoice's empty state (tab and report sheet alike, both
  through `AllocationPanel`) offers invoice-level editing as the primary
  action — "Allocate this invoice" opens the same override editor and the
  save creates the invoice's own row — and, when the invoice has a
  hierarchy parent, the secondary "or set up on <parent> to cover all its
  invoices" link to the parent's tab (the 3b link rule: the linking page is
  itself flag-gated). No parent, primary only. Presentation only: the
  resolver, override precedence, and the Unassigned bucket are untouched
  (design correction 2026-08-25 re-reading the ticket and prototype). The
  tab payload carries `parentContract` for it.
- The editor table is sized for the report sheet's 600px width (QA
  2026-08-25: the prototype's fixed 160/192/160/48 columns plus a 128px
  amount input laid out at 621px inside a 549px `overflow-hidden` wrapper,
  clipping the Amount cell and hiding the remove column): Type/Percentage/
  Amount/Actions at 128/144/128/44 with 12px cell padding and 112px
  inputs, and the wrapper scrolls horizontally rather than clipping if
  content ever exceeds it.

## Reports

Both are **static sibling routes** beside `reports/[type]/`
(`reports/invoice-cost-allocation/page.tsx`,
`reports/allocation-rollup/page.tsx`) — where the prototype put them. Not
`reportConfigs` entries: the `[type]` page is hard-wired to
`ContractsTableClient`, the summary report's rows are org units (not
contracts), and the invoice report needs a date-window control and a
row-click sheet the framework lacks (`InvoiceDiscrepancySheet` exists only
in the prototype). Static segments take precedence over `[type]` and
inherit `reports/layout.tsx`; `ReportTabs` gains the two entries explicitly
since the layout derives tabs from `reportConfigs` alone.

**Invoice Cost Allocation** (`/reports/invoice-cost-allocation`): invoices in
the date window (default this month; presets this/last month, this/last
quarter, YTD) × resolved allocation × invoice amount from the engine. Row
click opens the allocation panel with edit = invoice override.

Phase-4a amendments (built 2026-08-24; product sign-off 2026-08-24 on the
invoice-date rule, the published-only contract set, and the MCP shape):

- **Gating.** The page `notFound()`s and `ReportTabs` omits the entry unless
  the org's `cost-allocation` flag is on — the layout evaluates the flag
  server-side and passes it down, the contract tab's mechanism. The tab sits after Invoice
  Discrepancies; `reportConfigs` is untouched.
- **Rows** (`lib/v2/cost-allocation/invoice-report.ts`): the published
  contract set (`getContractsList({ status: 'active', productValues: true })`
  — the report runner's status). Decision: the register lists published
  billing records, matching the sibling reports; unconfirmed invoices are
  not listed. The contract tab's `'all'`-status amounts path intentionally
  differs — an invoice's own detail view vs the org register. Rows are
  filtered by `isInvoiceType` and resolved through the request-scoped
  `AllocationContext`. Amount = `scopeValuesFromEngineSpend(stamp, true,
fees)`, the 2b path: `recordedBase`, and "—" for a record absent from the
  engine set; product-scoped lines take the invoice's recorded per-product
  fees at its recorded rate, the tab's invoice rule (QA 2026-08-25: the
  current-window product stamp is zero for a past invoice, which blanked
  every inherited product-scoped chip and emptied the Spend by Allocation
  Target card). A chip's amount is percent × that value.
- **Invoice date** = the engine's booking anchor, `earliestIsoDate(
term_start_date)` (resolveFeeSegments' invoice rule; the discrepancies
  report calls the same field the invoice date), falling back to
  `execution_date`. Decision: an invoice with neither is placeable in no
  window, so it is excluded from every preset (All Time included) and the
  page shows "N invoices have no billing date" so the omission is visible.
- **Windows** (`report-window.ts`) are calendar presets in UTC, half-open
  `[start, end)`. Month and quarter presets take the whole calendar period;
  YTD runs Jan 1 through today inclusive; **All Time** (added at product
  review 2026-08-24 — the prototype had it, and historical invoices are the
  common case) is the engine's full date range. The preset is a `?period=` search
  param (server re-load); the target and vendor filters are in-memory. A
  Reset (`BulkActionsBar`'s outline/sm/h-8 button) renders only when the
  period, the target filter, or the vendor filter deviates from its default
  and restores all three in one click (QA 2026-08-25). The summary report
  has no equivalent yet.
- **Target filter** matches the row's explicit resolved lines — an
  inherited line counts, an employee's cost-center attribute and a target's
  ancestors do not (Q2b). Options dedupe on the engine key; a name shared
  across targets gets its type appended.
- **Sheet** reuses `AllocationPanel` (extracted from the contract tab, not
  copied): same server action, same `manage Organization` gate, same
  "Override for this invoice" / "Remove override". A save calls
  `router.refresh()` because the rows are server-loaded. An unallocated
  invoice shows the Unassigned state plus a link to the parent contract's
  `?view=cost-allocation` tab; the report page is itself flag-gated, so the
  3b link rule holds by construction.
- **CSV export deferred.** `ExportReportCSVButton` posts contract ids to the
  reportConfigs-driven column exporter, which cannot carry per-invoice
  allocation chips; a bespoke exporter is out of scope here.

**Cost Allocation Summary** (`/reports/allocation-rollup`, titled "Cost
Allocation Summary"): the tree from `org_units` for the levels in use, with
individual users as its bottom level (2026-08-26; the prototype's
`LEVEL_ORDER` ends in Individual User), rows per node with Budget (editable,
per fiscal year of the selected window),
Rolled-up Budget (sum of descendants), Direct Spend, Rolled-up Spend, Total,
Difference. Level slicer reroots the accordion at any level in use. Spend
comes from `groupBy: { kind: 'allocation', level }` over the window.

Cost centers and reconciliation (decisions Q2, Q2b): the slicer gains a
**Cost Center** view — flat, no expansion, but the Direct/Rollup columns
stay live: Direct Spend = lines targeting the CC node, Rolled-up Spend =
user-line spend attributed via each employee's cost-center value ("let's
do both", product 2026-08-25). Every view — tree levels and the CC view
alike — carries two non-expandable catch-all rows so its total always
reconciles with the invoice and monthly reports: **"Outside hierarchy"**
(in tree views: CC-targeted spend and any target with no ancestor at a
viewable level; in the CC view: tree-node-targeted spend and user lines
whose employee has no cost-center value) and **"Unassigned"** (contracts
with no allocation — the engine's existing bucket). User-line spend
therefore appears in both a tree view (via the org tree) and the CC view
(via the attribute); each view remains internally additive to the same
grand total. The invoice report's allocation-target filter stays on
explicit line targets only.

Phase-4b amendments (built 2026-08-24; pending product review):

- **Gating and tab** exactly as 4a: `notFound()` behind the org's flag,
  `ReportTabs` entry after Invoice Cost Allocation, `reportConfigs`
  untouched.
- **Amounts: one engine query, the allocation dimension's first production
  caller.** `loadAllocationRollupReport` (`lib/v2/cost-allocation/
rollup-report.ts`) calls `runSpendQuery` — the runner behind the budget
  overview, the dashboard cards, and `get_spend`, so population, currency
  policy, derivation cache, and the org's default cost method (psk-1877)
  are shared by construction — with `groupBy: { kind: 'allocation', level:
'user' }`. That level keeps every explicit target as its own key, so the
  per-target window totals are the sufficient statistic every view rolls up
  from; `buildAllocationRollup` (`rollup-report-rows.ts`, pure) routes each
  target through `rollupToLevel` at every level with nodes, so Direct vs
  Rollup is rollupToLevel's own flag. Decision: one query at 'user' rather
  than one query per view. Consequence to note: the engine splits cents per
  explicit target and the report sums them to nodes, whereas
  `groupBy: { level: 'business_group' }` (the monthly report's split)
  merges shares per node before splitting — per-period totals are
  identical, but a node's cents can differ from the monthly report's group
  row by at most a cent per contract-month. Basis is the org's default cost
  method with no per-report selector (spec-silent choice). A key the
  request's context no longer resolves keeps its money in "Outside
  hierarchy" rather than dropping out of the total.
- **Node figures are view-independent**: a node's direct/rollup/total is
  what rollupToLevel attributes to it at its own level, so it reads the
  same as a root of its level's view and expanded under an ancestor. Only
  the roots and the "Outside hierarchy" remainder change per view. An
  employee whose leaf IS the node counts in that node's Rollup (the 2a
  rule), so a parent's rollup equals the sum of its children's totals — its
  own people included, now that they are its bottom-level children; the
  reconciliation invariant and that identity are property tests over seeded
  random trees.
- **Windows** (`resolveRollupWindow`, `report-window.ts`): the calendar
  presets shared with the invoice report (YTD, this quarter, this month,
  last month), **Current FY** and **Projected FY** (2026-08-26: the org's
  whole current fiscal year and the one after it, resolved with the
  engine's `fiscalYearOf` so they are exactly the `currentFY` / `nextFY`
  windows behind the dashboard's Current Estimated Spend and Projected
  Spend — the presets on which the two surfaces reconcile; the summary
  only, the invoice report's presets stay calendar), All Time, and a
  custom range typed inclusive and made half-open. All Time and custom ranges are bounded to 2000-01-01 ..
  2100-01-01 — the spend route's 100-year cap and the FX provider's floor.
  Default preset: Current FY (2026-08-26; was year to date). Presets and
  custom dates are search params (server re-load); the level slicer and
  expansion are client state over the full payload (every view ships at
  once). On the Current FY preset the Total Spend card becomes the
  dashboard's pair — Current FY Spend beside Projected FY Spend, the latter
  from the same `nextFY` total query `useCostMethodTotals` runs
  (`AllocationRollupData.projected`, null on every other preset).
- **Typed dates** (2026-08-26): the From/To fields seed from the window on
  show — a preset's resolved dates as much as a typed range — so a preset
  is a starting point to adjust, and they are typed in the user's regional
  date format (`DateField` takes the date-fns `pattern`; a native
  `type="date"` renders in the browser locale and cannot follow the
  setting).
- **Budgets** (`budgets.ts`, decision Q4): fiscal years numbered by their
  start year (the engine's convention) from `organizations.
fiscal_year_start_month`; a node's Budget is the sum over the FYs the
  window touches. A window inside one FY is editable inline (writes that
  FY); a window spanning FYs shows the sum read-only — no proration, so no
  single FY to write. Rolled-up Budget = every strict descendant's own
  budget (the prototype summed leaves only). Difference = own budget −
  total, "—" without a budget (the prototype's rule). The Total Budget card
  is every budget under the view's roots counted once (each root's own +
  rolled-up); Total Spend is the reconciled grand total including both
  catch-alls. Writes go through `saveAllocationBudgetAction` behind the
  `manage Organization` gate, with `assertBudgetTargetInOrg` as the tenancy
  check, and revalidate the report route.
- **Views and degraded shapes** (§Fallback matrix): tree views are
  `getOrgHierarchyLevelOrder` intersected with levels that have at least
  one node; the Cost Center view appears when CC nodes exist; a Users view
  appears whenever the org has employees, listing active employees plus any
  inactive one carrying spend or a budget (marked stale). A single view with
  nothing to expand renders flat — Budget | Spend | Difference, no slicer —
  which is the matrix's "no rollup column". No views at all is the empty
  state linking to Settings › Employees.
- **Individual User is the tree's bottom level** (2026-08-26, restoring the
  prototype's `LEVEL_ORDER`; built "both ways" like the Cost Center view,
  Q2b). Until then a user row existed only in D1, and with a tree a line on
  a person rolled into their leaf and the person was never a row. Now the
  same user rows nest under the unit the roster assigns them to
  (`org_employees.org_unit_id`; sub-units first, then people, each by
  name), and the Users view is that list flat. A user row is the employee's
  own explicit lines — direct only, rollup 0 — which its unit already counts
  as rollup, so no parent figure moves and every view's grand total still
  reconciles; a user budget rolls into the unit's Rolled-up Budget like any
  descendant's. Org-unit and cost-center lines sit in the Users view's
  "Outside hierarchy". The `TypeTag` marks a person as "User" under a unit.
  `get_allocation_rollup` keeps people out of its tree-level rows (a row per
  head of staff under every team) and serves them at `level: "user"`. Open
  product call: "Expand all" currently opens every unit down to its people
  (Berenberg: 1589 under 260 teams).
- **Level pill only below the view's level** (product feedback 2026-08-25):
  a view's root rows are all at the slicer's level, so tagging each one
  ("Business Group" × N in the Business Groups view) was clutter; the
  `TypeTag` renders only on rows expanded from beneath a root, where the
  level carries hierarchy context.
- **Stale marker**: tree nodes via `getStaleNodeIds` over active leaf
  assignments; cost centers via active employees' `cost_center` values
  (`activeCostCenterNames`, now exported from the picker); user rows when
  the employee is inactive.
- **Context loaded twice per request**: `runSpendQuery` loads its own
  `AllocationContext` for the dimension; the report loads the request-scoped
  one for units, employees, and cost-center ids. Same trade-off as 3b's
  duplicate relationships fetch; threading a preloaded context into
  `runSpendQuery` is a follow-up.
- **CSV export deferred**, as 4a.
- **Budget edits never re-run the engine** (2026-08-25, after "updating
  the budget is slow"): the save action no longer revalidates the route and
  the client no longer calls `router.refresh()` — each of which re-rendered
  the page and re-ran the org-wide spend query for a number spend does not
  depend on, so the save is now just the gated upsert. The apply is
  deliberately pessimistic (product call — an optimistic layer spawned
  rollback races for no felt gain once the engine re-run was gone): the
  cell disables until its save settles, a confirmed save updates the rows
  through `applyBudgetEdit` (`rollup-report-rows.ts`, pure — row
  budget/difference, ancestors' rolled-up budgets, per-view budget totals —
  pinned equal to `buildAllocationRollup` by the rebuild-parity test), a
  failed save keeps the draft in the cell with a toast, and a save landing
  after a window switch is dropped (report-generation guard; cells remount
  per window so drafts never cross).

## MCP / Assistant (PSK-1953)

Tools are auto-adapted into the in-app assistant, so one tool set serves
both:

- `get_cost_allocation(contract | invoice)` — resolved lines with percent,
  amount, target path, and whether the allocation is own / inherited /
  active-users. Built in phase 4a (`app/lib/mcp/tools/cpm/cost-allocation.ts`,
  read-only annotations, auto-adapted into the assistant): input is
  id-only (decision: document numbers resolve through `get_contract`
  first, whose disambiguation the tool does not duplicate); output is
  `provenance { kind: own | inherited | unassigned, sourceContractId }`, one
  scope per allocated unit with its `mode` (decision: `active_users` is a
  scope mode, not a provenance kind — an inherited active_users allocation
  is both), `valueBase`, lines of `{ target, path, percent,
amountBase }` where `path` is the tree breadcrumb root-first (an employee's
  is the unit they sit under), and `unlinkedUserCount` only when nonzero.
  Amounts come from `scopeValuesFromEngineSpend` over the engine set; a
  record outside it returns percents with a note.
- `get_allocation_rollup(level, period, from?, to?)` — the summary
  report's rows. Built in phase 4b (same module, read-only annotations,
  auto-adapted): `level` is validated against the org's views in use and
  the error names them; `period` takes the report's presets (default
  `ytd`) with `from`/`to` for `custom`. Output is the view's rows
  depth-first (`depth`, root-first `path`, budget, rolledUpBudget, direct,
  rollup, total, difference, stale), the two catch-all rows, `totals`,
  `levelsInUse`, the half-open `window`, `fiscalYears`, and the cost
  method the amounts were computed under.
- Existing spend tools gain the `allocation` dimension.

## Migration phases

1. **Tree + employee decoupling**: `org_units`, `org_employees.org_unit_id`,
   sync service inside the data-layer write functions + MCP add-users,
   backfill script, tests for ragged paths, later fill-in of a missing
   level, and weekly re-import stability. Import and directory flip to nodes
   (§Employee import and directory): `matchBusinessGroups`, value-map and
   CSV-upload group creation, `group_id` reader repoint on both
   `org_employees` and `contract_users`, `removeEmployeeFromGroup` and the
   groups-page employee surfaces removed, both `group_id` columns frozen.
   Must land as one release; Berenberg's weekly upload exercises it
   immediately.
2. **Allocations**: the three allocation tables, `AllocationContext` +
   resolver, inheritance, `active_users` mode, Cost Allocation tab, audit
   activity. The tab is gated per org by the admin app's `cost-allocation`
   feature flag (`flag.ts` → flagkit, evaluated in the page's server
   components with `{ organizationId, userId }` and passed down as a
   boolean prop — never read client-side; `FF_COST_ALLOCATION=true`
   bypasses the per-org evaluation entirely whenever it is set, which is
   what a local database with no flag rows needs; the MCP tools share the
   gate). Swapped from the env-only kill switch 2026-08-26 for the per-org
   rollout.
3. **Spend convergence**: `splitByAllocation` in the engine and the monthly
   report transform, `allocation` dimension, ACL backfill with the two
   gates, consumer repoint, Owner tab field rewire, `extractSharedGroups`
   rename, MCP `update_contract` drops `business_group`. Monthly report
   goldens pinned before and after. Built in two chunks: (a) engine
   dimension + transform swap + backfill + gates (this repo state); (b) the
   `extractBusinessGroups` consumer repoint, Owner tab rewire, and rename.
4. **Reports + MCP**, two chunks: (a) the Invoice Cost Allocation report
   and get_cost_allocation; (b) the Cost Allocation Summary with
   budgets, the Q2/Q2b cost-center routing in rollupToLevel (revising the
   2a "CCs never roll" pin as a spec'd change), and
   get_allocation_rollup (built 2026-08-24 — see the phase-4b amendments
   under §Reports and §Rollup to a level).

Phases 1–2 and 3 can be reviewed independently; 4 depends on both.

## Decisions (2026-08-24, pending product sign-off)

The v1/v2 drafts carried these as open questions; resolved in design review
2026-08-24. Each is threaded into the body section it affects — this list is
the record.

1. **Closed months → live inherit.** Un-overridden invoices always resolve
   from the current ancestor allocation, past and future; the invoice
   override is the manual pin. Bulk "lock period" snapshot: possible
   follow-up, not v1. (§Allocation resolver)
2. **Cost centers → slicer view + catch-all rows.** "Cost Center" joins the
   summary report's level slicer as a flat view; tree views carry "Outside
   hierarchy" and "Unassigned" rows so every view's total reconciles with
   the other reports. (§Reports) **Q2b addendum (product 2026-08-25,
   "let's do both"):** the CC view shows explicit CC allocations as Direct
   Spend AND user-allocated spend attributed via the employee's
   cost-center value as Rolled-up Spend. (§Rollup to a level, §Reports)
3. **Shared names → path identity, breadcrumb when ambiguous.** No
   uniqueness constraint; the picker shows a muted parent path only when
   two nodes share a name at a level. (§Contract tab behaviour) Extended
   2026-08-26 to the reports: the summary's top-level rows (a child sits
   under its parent already), the invoice report's chips, its Spend by
   Allocation Target list, and its target filter options. One rule,
   `sharedNameBreadcrumbs` (target-path.ts), feeds the picker and all
   four. The allocation panel and the invoice sheet still print resolved
   lines by bare name — their refs come from the resolver, which does not
   stamp the breadcrumb yet. Prompted by two same-named departments under
   different groups reading as one in the Departments view.
4. **Budget period → per fiscal year, no proration in v1.** Sub-year
   windows compare against the containing FY's budget; multi-FY windows sum
   the FYs touched. (§`cost_allocation_budgets`)
5. **User targets → all org employees.** Cost owners without a seat are
   valid targets; "Add all active users" stays the seat-holder shortcut.
   (§Contract tab behaviour)
6. **Division → included in the picker.** The prototype's omission was an
   oversight; the picker is level-driven and offers every level with data.
   (§Contract tab behaviour)
7. **Amendments → nearest allocated ancestor.** Same walk as invoices; a
   middle amendment's override flows to later records. (§Allocation
   resolver)
8. **Stale nodes → marker only in v1.** Re-pointing is a manual edit;
   "Move allocations to…" is a named follow-up ticket; auto-migration on
   sync is ruled out. (§Never truncate)
9. **Sponsor spend → coexist now, retire later.** No change in this
   effort; the even-split sponsor spend table is recorded as a retirement
   candidate in favour of the user-level allocation rollup, Phil's call
   after the BG trial. (§Non-goals)
