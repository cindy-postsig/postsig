# MCP Tool: `research_compliance_check`

Implementation plan for the PostSig Research Rights Check tool.

## Where it lives

Adds to the **CPM MCP server** (`/api/cpm/mcp`). The data (vendor contracts, rights records) is CPM data, and all the route infrastructure — auth, scopes, telemetry, error handling — is already there. No new route or module needed.

---

## Step 1 — DB schema (1 migration)

### Reuse the existing source catalog; don't build a parallel one

PostSig already has a canonical vendor/product model: `vendors` and `vendor_products_details`. "FactSet Estimates" is a global product — only the _rights_ are org-specific (each org has its own contract). So we do **not** create an org-scoped source registry. Instead:

- **Matching** resolves a raw input name to an existing `vendor_products_details` (or `vendors`) row.
- **Aliases** that aren't worth promoting into the product record live in one small lookup table, `cpm_source_alias`, keyed to the canonical product. This is shared catalog data, not org-scoped.

**`cpm_source_alias`** — known name variants → canonical product

```sql
id, vendor_product_id (FK → vendor_products_details, nullable),
vendor_id (FK → vendors, nullable),
alias (TEXT, normalized), created_at
-- exactly one of vendor_product_id / vendor_id is set (CHECK constraint)
```

Not org-scoped — a curated alias like `FDS → FactSet` is true for everyone. (If an org ever needs a private alias, add a nullable `organization_id`; out of scope for MVP.)

### Org-scoped rights and audit

**`cpm_rights_record`** — structured usage rights per source per org

```sql
id, organization_id, vendor_product_id (FK → vendor_products_details, nullable),
vendor_id (FK → vendors, nullable),
contract_id (nullable FK → contracts),
permitted_report_types (JSONB), prohibited_report_types (JSONB),
permitted_usage (JSONB), prohibited_usage (JSONB),
permitted_geographies (JSONB), prohibited_geographies (JSONB),
permitted_content_usage (JSONB), prohibited_content_usage (JSONB),
internal_only (BOOL DEFAULT false),
attribution_required (BOOL), attribution_language (TEXT), attribution_placement (TEXT),
approval_status (TEXT: 'human_approved' | 'ai_extracted_pending_review' | 'pending'),
confidence (TEXT: 'high' | 'medium' | 'low'),
last_reviewed (DATE), reviewed_by (UUID nullable),
metadata (JSONB), created_at, updated_at
```

Note: **no `policy_version` here.** A rights record is _data_; the ruleset version that evaluated it belongs on the decision, not on the record. Record provenance is carried by `approval_status`, `confidence`, `last_reviewed`, `reviewed_by`. The `internal_only` flag and the `*_content_usage` / `*_geographies` arrays exist so the evaluator can actually use them (see Step 3).

**`cpm_rights_clause`** — clause-level evidence linked to a rights record

```sql
id, organization_id, rights_record_id (FK → cpm_rights_record),
agreement_name (TEXT), agreement_type (TEXT),
clause_reference (TEXT), clause_summary (TEXT),
created_at, updated_at
```

**`cpm_compliance_decision`** — append-only audit log, one row per tool call

```sql
id, organization_id, decision_id (TEXT UNIQUE — a UUID),
user_id (UUID), token_id (TEXT),
report_context (JSONB), sources_input (JSONB),
source_decisions (JSONB), overall_decision (TEXT),
human_review_required (BOOL),
policy_version (TEXT), rights_dataset_version (DATE),
created_at
```

**Why a dedicated audit table — we already log every tool call.** The route's `recordToolCall` telemetry captures input/output for _every_ MCP call, but it **truncates large payloads to a `{_truncated: true}` sentinel** (`MAX_OUTPUT_SAMPLE_BYTES`) and is operational telemetry, not a system of record. A compliance decision must be legally durable, queryable by `decision_id`, and never truncated — so it gets its own first-class table. Telemetry still fires as usual; the two are complementary, not redundant.

All org-scoped tables get RLS (`organization_id = user_organization_id()`), `trigger_set_timestamp()` on the mutable ones, and indexes on `organization_id` + FK columns. `cpm_source_alias` is global read; writes are admin/backfill only.

---

## Step 2 — Source matcher (`lib/v2/compliance/source-matcher.ts`)

Resolves a raw input like `"FDS estimates"` to a canonical product in `vendor_products_details` / `vendors`.

**Algorithm:**

1. Normalize input: lowercase, strip punctuation, collapse whitespace.
2. Exact match against canonical product/vendor names **and** `cpm_source_alias.alias` → confidence `high`.
3. Token-overlap score against the candidate set → best match above threshold → confidence `medium`.
4. Below threshold → no match, confidence `low`.

Returns:

```ts
{ input_source_name: string, matched_name: string | null,
  vendor_product_id: number | null, vendor_id: number | null,
  match_confidence: 'high' | 'medium' | 'low' }
```

When `match_confidence === 'low'`, the caller treats the source as `human_review_required`. No external library needed — token overlap over the catalog is cheap. The candidate set (products + aliases) is loaded **once per request**, not per source (see Step 4).

---

## Step 3 — Policy evaluator (`lib/v2/compliance/policy-evaluator.ts`)

Pure function, no DB access. Takes a rights record + the source's requested usage + the full report context (including `geography`, `content_usage`) + `user_context` + `strict_mode`, and returns a per-source decision.

**Priority order (every spec decision value has a branch):**

1. No rights record matched → `unknown`; in `strict_mode` → `human_review_required`.
2. `report_type ∈ prohibited_report_types` → **`blocked`** (high confidence).
3. `intended_usage ∈ prohibited_usage`, or `content_usage ∈ prohibited_content_usage` → **`blocked`**.
4. Geography: if `prohibited_geographies` intersects `report_context.geography`, or `permitted_geographies` is set and does **not** cover all requested geographies → **`blocked`** (out-of-territory).
5. `internal_only === true`:
   - `report_type` is an internal type (`internal_research`, `draft_exploratory`) → continue evaluation as permitted.
   - otherwise (any external/client report) → **`internal_only`** decision.
6. `approval_status === 'ai_extracted_pending_review'`:
   - `strict_mode` → **`human_review_required`**.
   - non-strict + `confidence === 'medium'` → **`allowed_with_warning`** (carry the warning into restrictions).
   - non-strict + `confidence === 'low'` → **`human_review_required`** regardless.
7. `report_type ∈ permitted_report_types` (human-approved record):
   - any requested `intended_usage`/`content_usage` permitted but others not → **`allowed_limited_use`**.
   - `attribution_required` → **`allowed_with_attribution`**.
   - fully permitted, no attribution → **`allowed`**.
8. Fallthrough (record exists but report type neither permitted nor prohibited) → `unknown`; in `strict_mode` → `human_review_required` (default deny).

**`user_context` in MVP:** accepted and logged, but **not** a decision input — there are no role/desk-level rights records yet. This is a deliberate scope cut, called out so it isn't mistaken for a bug. (Hook for v2: per-desk entitlement records.)

**Confidence propagation:** the per-source `confidence` is the **minimum** of the source-match confidence and the rights-record confidence. A high-confidence record reached through a medium-confidence name match is reported `medium`.

Returns the full per-source shape: `decision`, `confidence`, permitted/prohibited usage arrays, attribution object, restrictions, evidence (from `cpm_rights_clause`), recommended action.

---

## Step 4 — Tool handler (`app/lib/mcp/tools/cpm/compliance.ts`)

Follows the `McpToolDef` pattern in the existing CPM tools. `strict_mode` defaults to `true` in the Zod schema (matching the spec).

**Zod input schema** mirrors the spec: `report_context`, `sources[]`, `user_context`, `options`.

**Handler flow:**

1. `requireMcpContext()` → `organizationId`, `userId`, `tokenId`.
2. **Load once, not per source** (avoids N+1):
   - candidate catalog (products + `cpm_source_alias`) — one query.
   - run the in-memory matcher over every requested source → list of matched product/vendor IDs.
   - one batched query for `cpm_rights_record` across all matched IDs for this org; one batched query for `cpm_rights_clause` across those record IDs.
3. **Org scoping on reads:** rights records are read with the user's RLS-scoped client. If a path uses the service client for batching, it must filter by `organization_id` and run the existing `assertSameOrg` guard — never trust an ID resolved from catalog data without confirming the record's org.
4. Per source: run the policy evaluator → per-source decision. Unmatched (low-confidence match) → `human_review_required` with reason `source_unrecognized`.
5. Assemble the response:
   - `overall_decision`: all `allowed*` → `allowed`; any `blocked`/`internal_only` mixed with allowed → `partially_allowed`; all `blocked`/`internal_only`, none allowed → `blocked`; any `human_review_required` and no `blocked` → `human_review_required`; nothing resolvable → `unknown`.
   - `required_actions[]` derived from per-source decisions.
   - **`human_review_required[]`** (top-level): one entry per source needing review, with `reason` and `review_team`.
   - **`audit`** object: `decision_id` (UUID), `logged`, `timestamp`, `policy_version`, `rights_dataset_version`.
6. If `options.log_decision`: insert into `cpm_compliance_decision` via the **service client** (bypasses RLS like the telemetry writer; org is set explicitly from context), wrapped in `after()` so it never blocks the response.

**`decision_id`** is a UUID — not a timestamp string. A `YYYYMMDD_HHMMSS` ID collides on same-second calls and leaks timing; the human-readable timestamp lives in the `timestamp` field instead.

**`policy_version`** is a constant in the evaluator module (`research_rights_policy_vX`), bumped when the ruleset changes. **`rights_dataset_version`** is `max(last_reviewed)` across the rights records that fed this decision — it stamps the data snapshot the decision relied on.

Annotations: `{ readOnlyHint: true }` — never mutates contract or rights data.

---

## Step 5 — Register

`app/lib/mcp/tools/cpm/index.ts`: import `complianceTools` and spread into `cpmMcpTools`.

Scope: reuses `'cpm:read'` (read-only against rights records). If a tighter scope is wanted later (`'compliance:read'`), add it to `McpScope` and the token issuer.

---

## Step 6 — Tests (`__tests__/lib/compliance/`)

**`policy-evaluator.test.ts`** — one case per branch in Step 3:

- prohibited report type → blocked
- prohibited usage / content_usage → blocked
- out-of-territory geography → blocked
- internal_only + internal report → allowed; internal_only + client report → internal_only
- ai_extracted + strict → human_review_required
- ai_extracted + non-strict + medium → allowed_with_warning
- ai_extracted + non-strict + low → human_review_required
- permitted + attribution → allowed_with_attribution
- partial usage permitted → allowed_limited_use
- fully permitted → allowed
- no record / fallthrough → unknown (strict → human_review_required)
- confidence = min(match, record)

**`source-matcher.test.ts`**:

- exact canonical name → high
- known alias → high
- abbreviation / typo variant → medium
- unknown → low

**`compliance-tool.test.ts`** (mocked Supabase client):

- full request → output shape validation (incl. top-level `human_review_required[]` and `audit`)
- catalog + rights records loaded in batched queries, not per-source (assert query count)
- audit row written iff `log_decision: true`
- reads are org-scoped (a foreign-org rights record is never returned)

---

## What this does NOT include (per MVP non-goals)

- The backfill pipeline that populates `cpm_rights_record` / `cpm_rights_clause` and curates `cpm_source_alias` — a separate workstream.
- A UI for managing rights records.
- Compliance routing or escalation workflows (the tool only _flags_ `human_review_required`).
- Per-desk / per-role entitlement modeling — `user_context` is logged but not evaluated in MVP.

## Reference

Spec: `MCP Tool spec_ compliance check.md` (product design doc)
