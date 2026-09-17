# KPI / Reporting Refactor Plan

Refactor of the investor KPI surface following a code audit. The feature works and is
covered by tests; this is a layering + dedup + hardening pass. **No user-visible behavior
changes** except where explicitly called out (Phase 2 refresh path, Phase 4 error toasts).

## Ground rules

- Base the branch on `development` (suggested name: `feature/kpi-reporting-refactor`).
  Do not push or open a PR unless asked.
- One atomic conventional commit per phase (e.g. `refactor(investor): split reporting
domain into types/transforms/service`). Never reference AI/assistants anywhere.
- Validation gate after **every phase**, not just at the end:
  `npm run lint && npm run prettier:check && npx tsc --noEmit && npm test`
- Comments: only the _why_, never the _what_. Preserve the existing why-comments when
  moving code — they encode business rules.
- Moved logic keeps its tests; extracted logic gets new tests in `__tests__/`.

## Files in scope

| File                                                                                                                                                | Role today                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `lib/v2/kpis/service.ts`                                                                                                                            | Types + pure rollup + Supabase fetchers, all in one file           |
| `app/lib/actions/investor/custom-kpi.ts`                                                                                                            | `'use server'` — custom-KPI types, fetch, parse, mutations         |
| `app/lib/actions/investor/reporting-requests.ts`                                                                                                    | `'use server'` — request creation, recipient provisioning          |
| `app/(app)/(investor)/investor/company/[id]/customKpiRollup.ts`                                                                                     | Pure custom-KPI rollup + formatter, stranded in route folder       |
| `app/(app)/(investor)/investor/company/[id]/KpisContent.tsx`                                                                                        | 1,450-line client component, three tabs, two near-duplicate tables |
| `app/(app)/(investor)/investor/company/[id]/ReportingRequestDialog.tsx`                                                                             | Request dialog (touched lightly)                                   |
| `app/(app)/(investor)/investor/company/[id]/server-components.tsx`                                                                                  | Server wiring that passes data promises down                       |
| `__tests__/custom-kpi.test.ts`, `__tests__/reporting-rollup.test.ts`, `__tests__/custom-kpi-rollup.test.ts`, `__tests__/reporting-null-kpi.test.ts` | Existing coverage — must keep passing (imports will move)          |

---

## Phase 1 — Restructure the reporting domain in `lib/v2`

**Goal:** `lib/v2/kpis/` becomes the canonical home for all KPI/reporting data logic,
split so client components never import server-only code. Model it on `lib/v2/inv`
(`types.ts` / `transforms.ts` / `service.ts`).

### 1a. Create `lib/v2/kpis/types.ts`

Move from `service.ts`: `ReportingKpiValue`, `ReportingDocument`, `ReportingQuarter`,
`KpiCatalogField`, `ReportingDocTypeOption`, `PendingRequest`, `ReportingRequestDetails`.

Move from `app/lib/actions/investor/custom-kpi.ts`: `CustomKpiValue`, `CompanyCustomKpi`,
`CreateCustomKpiResult` (a `'use server'` file may only export async functions — the
type exports there today are a latent hazard).

Add the shared value-type union and use it everywhere `valueType` is currently `string`:

```ts
export type KpiValueType =
  | 'currency'
  | 'number'
  | 'percent'
  | 'text'
  | 'textarea';
export type CustomKpiValueType = Exclude<KpiValueType, 'textarea'>;
```

- `KpiCatalogField.valueType`, `ReportingKpiValue.valueType` → `KpiValueType`
- `CompanyCustomKpi.valueType` → `CustomKpiValueType`
- Derive the zod enum in custom-kpi from it: `z.enum(['currency', 'number', 'percent', 'text'] satisfies CustomKpiValueType[])`
  (or keep the literal tuple and add a `satisfies` check — the point is one source of truth).
- Delete the no-op `as ValueType` casts; where DB strings enter (`r.value_type`), narrow
  once at the service boundary.
- In `parseValue`, remove the unreachable `'textarea'` branch (custom KPIs can't be
  textarea by schema) and type the parameter as `CustomKpiValueType`.

### 1b. Create `lib/v2/kpis/transforms.ts` (pure, client-safe)

**No imports of `@/utils/supabase/*` or `@/utils/pino`** — this module is imported by
client components.

Move here:

- `formatPeriodLabel`, `rollUpToFiscalYears`, and its `hasValue` helper (from `service.ts`)
- `customDisplayValue`, `formatCustomDisplay` (from route-folder `customKpiRollup.ts`,
  which is then deleted)
- New `currentPeriod(): { year: number; quarter: number }` — replaces the duplicated
  `Math.floor(now.getMonth() / 3) + 1` in `KpisContent.tsx` (~line 494) and
  `ReportingRequestDialog.tsx` (~line 238)
- New shared `formatKpiDisplay(valueType: KpiValueType, numeric: number | null, text: string | null): string`
  — collapse the duplicate formatters `formatKpiValue` (KpisContent) and
  `formatCustomDisplay` (customKpiRollup) into one. Keep `formatCustomDisplay` as a thin
  alias or update call sites; do not change output for any existing case
  (currency via `formatCurrency`, percent as `` `${n}%` ``, number via `toLocaleString`,
  text-trim fallback to `'-'`).

Note: `formatCurrency` comes from `@/app/lib/utils` — verify it is client-safe (it is
already used in client components) and keep that import.

### 1c. Slim `lib/v2/kpis/service.ts` to fetchers only

Keeps: `getCompanyReporting`, `getCompanyReportingRequests`, `getReportingRequestDetails`,
`getKpiCatalog`, `getReportingDocTypes`, plus the `unwrap` helper. Re-import types from
`./types` and `formatPeriodLabel` from `./transforms`.

Add here (moved from `custom-kpi.ts`): `getCompanyCustomKpis(companyId)` — the
defs+values fetch and grouping, unchanged.

### 1d. Thin out the action files

`app/lib/actions/investor/custom-kpi.ts` keeps only the four `'use server'` functions:

- `createCustomKpi`, `setCustomKpiValue`, `deactivateCustomKpi` — validation + auth +
  writes (writes can stay inline in the action; they're already small).
- `getCompanyCustomKpis` — becomes a one-line wrapper delegating to the lib/v2 service
  (it must remain an action because `KpisContent` calls it from the client on refresh).
- Replace the hand-rolled `resolveOrg` with `getUserMetadata` from `@/data/users`
  (what `reporting-requests.ts` already uses). Preserve the exact error strings
  (`'Not authenticated.'`, `'No organization found.'` — map from what getUserMetadata
  returns; if it doesn't distinguish the two cases, use `'Not authenticated.'`).
- Extract the duplicated `KPIS_DISABLED` const (also in `reporting-requests.ts`) into a
  single shared module, e.g. `lib/v2/kpis/flags.ts`:
  `export const KPIS_DISABLED = process.env.VERCEL_ENV === 'production';`

### 1e. Barrel + import sweep

- Export the reporting module from `lib/v2/index.ts` (types, transforms, service),
  matching how `investor` is exported there.
- Update all imports: `KpisContent.tsx`, `ReportingRequestDialog.tsx`,
  `CompanyDetails.tsx`, `server-components.tsx`, `reporting-requests.ts`, and the four
  test files. Client components must import values only from `transforms`/`types`
  (type-only imports from anywhere are fine).
- Update test imports: `reporting-rollup.test.ts` → transforms;
  `custom-kpi-rollup.test.ts` → transforms; `custom-kpi.test.ts` → keep targeting the
  actions (it tests validation/tenancy/parse behavior through them) — its supabase mock
  may need its module path updated if the fetch moved; `reporting-null-kpi.test.ts` →
  service.

**Verify:** validation gate, plus `npm run build` once at the end of the phase (the
client/server split is exactly what the build enforces).

---

## Phase 2 — Remove the double refresh on custom-KPI saves

Today every mutation both calls `revalidatePath` (re-rendering the entire company page
server-side — all promises in `server-components.tsx`) **and** triggers a manual client
re-fetch (`refreshCustomKpis` in `KpisContent.tsx`).

- `setCustomKpiValue`: **remove** `revalidatePath` — this runs on every cell blur; the
  targeted client refresh (`onSaved` → `refreshCustomKpis`) already covers the UI.
- `createCustomKpi`, `deactivateCustomKpi`: **keep** `revalidatePath` (rare, structural
  changes; keeps router cache honest for back-navigation) and keep the client refresh.
- Standardize both action files on the dynamic-route form:
  `revalidatePath('/investor/company/[id]', 'page')` (currently `custom-kpi.ts` uses the
  literal-path form and `reporting-requests.ts` the dynamic form).
- Keep the `useState`/`useEffect(initialCustomKpis)` sync in `KpisContent` as-is — it is
  what reconciles a revalidation-delivered prop with locally refreshed state.

**Verify:** existing `custom-kpi.test.ts` asserts on `revalidatePath` calls — update the
`setCustomKpiValue` expectations to assert it is _not_ called. Manually reason through:
type a value → blur → cell shows saved value; add a KPI → row appears; remove → row gone.

---

## Phase 3 — Deduplicate and decompose `KpisContent.tsx`

The biggest diff; keep it purely mechanical. Rendered output must be pixel-identical.

### 3a. Move the pivot logic into `transforms.ts` with tests

Extract these `useMemo` bodies into pure functions (component keeps thin `useMemo`
wrappers over them):

- `buildDisplayedPeriods(period, submitted, flowCodes, customKpis): ReportingQuarter[]`
  — the annual/quarterly switch including the custom-only fiscal-year synthesis with the
  negative-`packId` sentinel (KpisContent ~lines 317–356). Preserve the existing
  why-comments about the sentinel and Q4/YTD mirroring.
- `pivotKpisByCategory(displayedPeriods): Map<string, KpiMetric[]>` — the
  `quantCategories` pivot (~lines 372–402). Return the Map directly and derive the
  ordered category list from it — today the code builds a Map, spreads it to entries
  (`quantCategories`), then rebuilds a Map (`standardByCat`); collapse that churn.
  Move the `KpiMetric` interface to `types.ts`.
- `buildPeriodColumns(submitted, customKpis, current: {year, quarter}): PeriodColumn[]`
  (~lines 471–498) — pass `currentPeriod()` in from the component so the function stays
  pure/deterministic. Move `PeriodColumn` to `types.ts`.

New tests in `__tests__/` (e.g. `reporting-pivots.test.ts`): custom-only FY synthesis
(negative packId, YTD vs FY label by Q4 presence, skips years covered by standard packs),
category pivot ordering by `sortOrder`, period columns (dedup of a quarter present in both
submitted packs and custom values keeps the real packId; current quarter always present;
newest-first sort).

Also fix the small duplication: the `collapsedCategories` `useState` initializer
(~lines 406–428) re-derives the category list that the `kpiCategories` memo already
computes. Extract one helper (pure, in the component file is fine) used by both.

### 3b. Extract the shared table rows

The annual table (~lines 836–982) and quarterly authoring table (~lines 1003–1279)
duplicate the category header row, standard metric rows, and custom rows. Extract into
small components in the route folder (they're view-specific; they do not go to lib/v2):

- `KpiCategoryHeaderRow` — collapsible header row (chevron, uppercase label, colSpan,
  keyboard handling).
- `KpiMetricRow` — one standard metric across a generic list of columns. Parameterize by
  `columns: { key: string; packId: number | null }[]` and look up
  `metric.valuesByPack.get(packId)`; both tables render the same read-only cell.
- `CustomKpiRow` — one custom KPI across columns, with a `mode: 'display' | 'edit'`
  switch: display renders `formatKpiDisplay(customDisplayValue(...))`, edit renders
  `CustomKpiCell` and the delete button. Banding (`bg-band` alternation by
  `metrics.length + idx`) stays with the caller or moves in — either way keep the exact
  class strings.

Keep `CustomKpiCell` as-is (its blur/Escape/commit behavior is correct and subtle).

### 3c. Split the tabs into files

`KpisContent.tsx` currently holds three tabs. Split into sibling files, keeping
`KpisContent` as the shell (tab list, dialogs, shared state):

- `KpiPerformanceTab.tsx` — view/period toggles, grid view, both tables (uses 3a/3b).
- `ReportingPacksTab.tsx` — the packs table with expand/collapse + preview/download.
- `PendingRequestsTab.tsx` — the pending-requests table (move `requestTypeConfig` and
  `formatRequestDate` with it).

State that only one tab uses moves into that tab (e.g. `collapsedPacks`, `preview` can
move with packs; `view`/`period`/`gridPackId`/custom-KPI add state with performance).
State shared across tabs (request dialog open/type/edit) stays in the shell. Target:
no file over ~450 lines.

**Verify:** validation gate + `npm run build`. Then eyeball the page (all three tabs,
quarterly vs annual, grid vs table, add/edit/remove a custom KPI) against `development`.

---

## Phase 4 — Hardening sweep (small, independent fixes)

1. **Company/KPI mismatch guard** in `setCustomKpiValue`
   (`app/lib/actions/investor/custom-kpi.ts` ~line 155): the KPI is resolved by
   `public_id` only; nothing checks it belongs to `input.companyId` (the composite FKs pin
   both to the org, not to each other). Select `company_id` in the lookup and return
   `{ error: 'Custom KPI not found.' }` on mismatch. Add a test. (A DB-level composite FK
   `(custom_kpi_id, company_id)` is a possible follow-up — **out of scope here**, no
   migrations in this refactor.)
2. **No silent failures** (`KpisContent.tsx`):
   - `refreshCustomKpis` swallows errors with `.catch(() => {})` (~line 277) — show a
     destructive toast (`'Could not refresh KPIs'`).
   - `handleDocDownload` (~line 627) does nothing when `getVentureDocumentSignedUrl`
     returns null — show a destructive toast (`'Could not download document'`).
3. **`deactivateCustomKpi` zero-row update** returns `{ ok: true }` even when nothing
   matched. Chain `.select('id')` and return `{ error: 'Custom KPI not found.' }` when no
   row came back. Update/add a test.

**Verify:** validation gate.

---

## Explicitly out of scope

- Any DB migration / regeneration of `database.types.ts`.
- `reporting-requests.ts` provisioning/email flow beyond the shared `KPIS_DISABLED`
  constant and revalidate-style consistency.
- The `ReportingRequestDialog` beyond the `currentPeriod()` helper swap.
- Behavior of `rollUpToFiscalYears`, `customDisplayValue`, or any formatting output —
  these move but must not change (existing tests are the contract).
- Visual/styling changes of any kind.

## Definition of done

- Validation gate green; `npm run build` green.
- No value imports from `lib/v2/kpis/service.ts` (or any supabase-importing module)
  inside `'use client'` files — types/transforms only.
- `customKpiRollup.ts` deleted; no dangling imports.
- `git diff --stat` against `development` shows no changes outside the files listed in
  scope (plus new files under `lib/v2/kpis/` and `__tests__/`).
- Four atomic commits, one per phase, conventional messages.
