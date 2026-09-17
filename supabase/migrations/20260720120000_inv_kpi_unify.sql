-- UNIFY the KPI schema for PSK-1815 (investor manual entry/editing). Pre-launch
-- redesign: the whole KPI feature is gated off in prod (KPIS_DISABLED), so this
-- restructures the KPI tables and backfills the existing dev/demo data.
--
-- Before: inv_kpi_catalog (global defs) + inv_kpi_custom (org custom defs) +
-- inv_kpi_value (portco-submitted, kpi_code XOR custom_kpi_id) +
-- inv_kpi_custom_value (investor-authored). Requests linked via kpi_code XOR
-- custom_kpi_id.
--
-- After: one inv_kpi defs table (organization_id NULL = global/standard,
-- non-NULL = org custom; custom KPIs are org-wide only now — no company scope),
-- one inv_kpi_value table carrying both origins ('portco' hangs off a submission,
-- 'investor' is authored directly), and request lines carry a single kpi_id.

-- ---------------------------------------------------------------------------
-- 1. inv_kpi: one definitions table.
-- ---------------------------------------------------------------------------
CREATE TABLE inv_kpi (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    -- NULL = global/standard seeded row; non-NULL = an org's custom KPI.
    organization_id   UUID REFERENCES organizations(id) ON DELETE CASCADE,
    -- Kept for standard rows (stable identifier used by requests/seeds); NULL for
    -- custom rows.
    code              TEXT,
    label             TEXT NOT NULL,
    category          TEXT NOT NULL,
    value_type        TEXT NOT NULL CHECK (value_type IN ('currency', 'percent', 'number', 'text', 'textarea')),
    unit              TEXT,
    description       TEXT,
    placeholder       TEXT,
    is_flow           BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Backfill-only bridge from the old custom-def ids to the new ids; dropped at
    -- the end of this migration.
    legacy_custom_id  BIGINT
);

-- Standard codes are globally unique; custom rows carry no code.
CREATE UNIQUE INDEX inv_kpi_code_uq ON inv_kpi (code) WHERE organization_id IS NULL;
CREATE INDEX idx_inv_kpi_org ON inv_kpi (organization_id) WHERE is_active;

-- Standard defs from the catalog (organization_id NULL, keep code).
INSERT INTO inv_kpi (organization_id, code, label, category, value_type, placeholder, sort_order, is_active, is_flow)
SELECT NULL, code, label, category, value_type, placeholder, sort_order, is_active, is_flow
FROM inv_kpi_catalog;

-- Tooltip descriptions for the standard defs (from the KPI Metrics sheet). Rows
-- with no sheet match (the Narrative KPIs) keep description NULL.
UPDATE inv_kpi k SET description = d.description
FROM (VALUES
    ('revenue_q',         'Total recognized revenue generated during the reporting period.'),
    ('ytd_revenue',       'Cumulative recognized revenue from the start of the fiscal year through the current period.'),
    ('net_sales',         'Gross sales less returns, discounts, allowances, and other sales deductions.'),
    ('bookings',          'Total value of customer contracts or orders signed during the period, whether or not yet recognized as revenue.'),
    ('contract_revenue',  'Revenue attributable to active customer contracts during the reporting period.'),
    ('arr',               'Annual Recurring Revenue: the annualized value of recurring subscription or contract revenue at period end.'),
    ('mrr',               'Monthly Recurring Revenue for the latest completed month, based on active recurring contracts.'),
    ('acv',               'Annual Contract Value: the average annualized revenue value of a customer contract.'),
    ('rev_growth',        'Percentage change in revenue compared with the prior reporting period.'),
    ('cagr',              'Compound Annual Growth Rate in revenue over the trailing three-year period.'),
    ('gross_profit',      'Revenue minus the direct costs required to deliver the product or service.'),
    ('gross_margin',      'Gross profit expressed as a percentage of revenue.'),
    ('cogs',              'Cost of Goods Sold: direct costs associated with delivering the product or service.'),
    ('ebitda',            'Earnings before interest, taxes, depreciation, and amortization; a measure of operating profitability.'),
    ('ytd_ebitda',        'Cumulative EBITDA from the start of the fiscal year through the current period.'),
    ('net_income',        'Profit or loss remaining after all operating expenses, interest, taxes, and other items.'),
    ('noi',               'Operating revenue minus operating expenses, excluding non-operating items.'),
    ('pbt',               'Profit Before Tax: earnings after operating and financing costs but before income taxes.'),
    ('opex',              'Total operating expenses incurred to run the business, excluding direct cost of revenue.'),
    ('rd_spend',          'Total spending on research, product development, and engineering activities.'),
    ('sm_ttm',            'Sales and marketing expense over the trailing twelve months.'),
    ('cash',              'Total unrestricted cash and cash equivalents available at period end.'),
    ('burn',              'Average net cash consumed per month after accounting for cash inflows.'),
    ('runway',            'Estimated number of months the company can operate before exhausting available cash at the current burn rate.'),
    ('net_cash_change',   'Increase or decrease in total cash during the reporting period.'),
    ('cash_inflow',       'All cash received during the reporting period from operations, financing, and other sources.'),
    ('cash_outflow',      'All cash paid during the reporting period for operations, investing, financing, and other uses.'),
    ('cf_breakeven_date', 'Forecast period when operating cash inflows are expected to equal or exceed operating cash outflows.'),
    ('oob_date',          'Projected date when available cash is exhausted if current assumptions remain unchanged.'),
    ('oob_years',         'Projected time in years until available cash is exhausted at the current burn rate.'),
    ('debt_balance',      'Total outstanding principal owed on loans, credit facilities, or other debt instruments.'),
    ('debt_available',    'Remaining undrawn borrowing capacity available under existing credit facilities.'),
    ('non_dilutive',      'Capital received without issuing equity, such as grants, subsidies, or debt financing.'),
    ('dollars_reserved',  'Cash or funds set aside for restricted, committed, or designated future uses.'),
    ('cac',               'Customer Acquisition Cost: average sales and marketing cost required to acquire one new customer.'),
    ('ltv',               'Lifetime Value: estimated gross value generated by a customer over the full relationship.'),
    ('clv',               'Customer Lifetime Value: estimated net economic value of a customer over the full relationship.'),
    ('ltv_cac',           'Ratio of customer lifetime value to customer acquisition cost.'),
    ('clv_cac',           'Ratio of customer lifetime value to customer acquisition cost using the CLV methodology.'),
    ('crc',               'Customer Retention Cost: average cost required to retain and support an existing customer.'),
    ('churn',             'Percentage of customers or recurring revenue lost during the reporting period.'),
    ('logo_retention',    'Percentage of customers retained from the beginning to the end of the reporting period.'),
    ('nrr',               'Net Revenue Retention: recurring revenue retained from existing customers after expansion, contraction, and churn.'),
    ('customers',         'Total number of active customer organizations at period end.'),
    ('healthplan_contracts', 'Total number of active contracts with health plan customers.'),
    ('dau',               'Daily Active Users: unique users who engaged with the product on an average day.'),
    ('wau',               'Weekly Active Users: unique users who engaged with the product during a typical week.'),
    ('mau',               'Monthly Active Users: unique users who engaged with the product during the month.'),
    ('v409a_pps',         'Fair market value per common share established by the latest independent 409A valuation.'),
    ('v409a_total',       'Total company valuation implied by the latest 409A assessment.'),
    ('next_financing',    'Expected timing of the company’s next equity or debt financing event.'),
    ('headcount',         'Total number of full-time employees at period end.'),
    ('rev_per_head',      'Revenue generated per full-time employee during the reporting period.')
) AS d(code, description)
WHERE k.organization_id IS NULL AND k.code = d.code;

-- Custom defs from inv_kpi_custom. Existing company-scoped rows become org-wide
-- (dev/demo data only); legacy_custom_id bridges the id remap for values/requests.
INSERT INTO inv_kpi (organization_id, code, label, category, value_type, unit, description, is_flow, sort_order, is_active, created_by, created_at, updated_at, legacy_custom_id)
SELECT organization_id, NULL, label, category, value_type, unit, description, is_flow, sort_order, is_active, created_by, created_at, updated_at, id
FROM inv_kpi_custom;

-- Old custom KPIs were unique per (org, company, label); org-wide now, formerly
-- company-scoped rows can share a label within an org. Collapse each such active
-- collision to one active def (lowest id wins) so the org-wide unique below holds.
-- Dev/demo data only; the deactivated duplicates keep their backfilled values.
UPDATE inv_kpi k SET is_active = FALSE
WHERE k.organization_id IS NOT NULL
  AND k.is_active
  AND EXISTS (
    SELECT 1 FROM inv_kpi o
    WHERE o.organization_id = k.organization_id
      AND o.label = k.label
      AND o.is_active
      AND o.id < k.id
  );

-- No duplicate active custom-metric name within one org (soft-delete frees it).
CREATE UNIQUE INDEX inv_kpi_active_label_uq
    ON inv_kpi (organization_id, label)
    WHERE organization_id IS NOT NULL AND is_active;

-- ---------------------------------------------------------------------------
-- 2. inv_kpi_value: rebuild in place into the unified shape (portco + investor).
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS inv_kpi_value_custom_scope_trg ON inv_kpi_value;
DROP FUNCTION IF EXISTS inv_kpi_value_custom_scope_check();

ALTER TABLE inv_kpi_value
    ADD COLUMN kpi_id BIGINT,
    ADD COLUMN company_id BIGINT,
    ADD COLUMN period_year SMALLINT,
    ADD COLUMN period_quarter SMALLINT,
    ADD COLUMN origin TEXT,
    -- Free-text provenance note for investor-authored values ("Backed by …").
    ADD COLUMN source TEXT,
    ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Existing rows are all portco-submitted; resolve kpi_id + company/period from the
-- submission and the old code/custom id.
UPDATE inv_kpi_value v SET
    origin = 'portco',
    kpi_id = COALESCE(
        (SELECT id FROM inv_kpi WHERE organization_id IS NULL AND code = v.kpi_code),
        (SELECT id FROM inv_kpi WHERE legacy_custom_id = v.custom_kpi_id)
    ),
    company_id = s.company_id,
    period_year = s.period_year,
    period_quarter = s.period_quarter
FROM inv_reporting_submission s
WHERE s.id = v.submission_id;

DELETE FROM inv_kpi_value WHERE kpi_id IS NULL;

-- Drop the old target columns (cascades their FKs to catalog/custom, the target
-- CHECK, the submission_code/custom uniques and the kpi_code index).
ALTER TABLE inv_kpi_value DROP COLUMN kpi_code;
ALTER TABLE inv_kpi_value DROP COLUMN custom_kpi_id;
-- Replaced by the 3-col (org + company) submission pin below.
ALTER TABLE inv_kpi_value DROP CONSTRAINT inv_kpi_value_submission_org_fk;
DROP INDEX IF EXISTS idx_inv_kpi_value_code;

ALTER TABLE inv_kpi_value
    ALTER COLUMN kpi_id SET NOT NULL,
    ALTER COLUMN company_id SET NOT NULL,
    ALTER COLUMN period_year SET NOT NULL,
    ALTER COLUMN origin SET NOT NULL,
    ALTER COLUMN submission_id DROP NOT NULL,
    ADD CONSTRAINT inv_kpi_value_period_year_chk
        CHECK (period_year BETWEEN 2000 AND 2100),
    ADD CONSTRAINT inv_kpi_value_period_quarter_chk
        CHECK (period_quarter IS NULL OR period_quarter BETWEEN 1 AND 4),
    ADD CONSTRAINT inv_kpi_value_origin_chk CHECK (origin IN ('portco', 'investor')),
    -- 'portco' rows hang off a submission; 'investor' rows are authored directly.
    ADD CONSTRAINT inv_kpi_value_origin_submission_chk
        CHECK ((origin = 'portco') = (submission_id IS NOT NULL)),
    ADD CONSTRAINT inv_kpi_value_kpi_fk
        FOREIGN KEY (kpi_id) REFERENCES inv_kpi(id) ON DELETE RESTRICT,
    -- At most one portco + one investor value per KPI cell.
    ADD CONSTRAINT inv_kpi_value_cell_uq
        UNIQUE NULLS NOT DISTINCT (kpi_id, company_id, period_year, period_quarter, origin),
    -- Pin the value's company to the caller's org (portco writes bypass RLS).
    ADD CONSTRAINT inv_kpi_value_company_org_fk
        FOREIGN KEY (company_id, organization_id)
        REFERENCES inv_company(id, organization_id) ON DELETE CASCADE,
    -- Pin a portco row's submission to the same org + company.
    ADD CONSTRAINT inv_kpi_value_submission_fk
        FOREIGN KEY (submission_id, organization_id, company_id)
        REFERENCES inv_reporting_submission(id, organization_id, company_id) ON DELETE CASCADE;

CREATE INDEX idx_inv_kpi_value_company ON inv_kpi_value (company_id, kpi_id);
CREATE INDEX idx_inv_kpi_value_kpi ON inv_kpi_value (kpi_id);

-- Investor-authored values from inv_kpi_custom_value.
INSERT INTO inv_kpi_value (organization_id, company_id, kpi_id, period_year, period_quarter, origin, submission_id, value_numeric, value_text, source, created_by, created_at, updated_at)
SELECT
    cv.organization_id,
    cv.company_id,
    k.id,
    cv.period_year,
    cv.period_quarter,
    'investor',
    NULL,
    cv.value_numeric,
    cv.value_text,
    cv.source,
    cv.created_by,
    cv.created_at,
    cv.updated_at
FROM inv_kpi_custom_value cv
JOIN inv_kpi k ON k.legacy_custom_id = cv.custom_kpi_id;

-- ---------------------------------------------------------------------------
-- 3. inv_reporting_request_kpi: single kpi_id.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS inv_reporting_request_kpi_custom_scope_trg ON inv_reporting_request_kpi;
DROP FUNCTION IF EXISTS inv_reporting_request_kpi_custom_scope_check();

ALTER TABLE inv_reporting_request_kpi ADD COLUMN kpi_id BIGINT;
UPDATE inv_reporting_request_kpi rk
SET kpi_id = COALESCE(
    (SELECT id FROM inv_kpi WHERE organization_id IS NULL AND code = rk.kpi_code),
    (SELECT id FROM inv_kpi WHERE legacy_custom_id = rk.custom_kpi_id)
);
-- Any line that couldn't resolve (should be none) is dropped rather than left
-- dangling with a NULL kpi_id.
DELETE FROM inv_reporting_request_kpi WHERE kpi_id IS NULL;

-- Dropping the columns cascades their constraints/indexes (the kpi_code/custom_kpi_id
-- FKs, the num_nonnulls target CHECK, the old request/kpi uniques).
ALTER TABLE inv_reporting_request_kpi DROP COLUMN kpi_code;
ALTER TABLE inv_reporting_request_kpi DROP COLUMN custom_kpi_id;

ALTER TABLE inv_reporting_request_kpi
    ALTER COLUMN kpi_id SET NOT NULL,
    ADD CONSTRAINT inv_reporting_request_kpi_kpi_fk
        FOREIGN KEY (kpi_id) REFERENCES inv_kpi(id) ON DELETE RESTRICT,
    ADD CONSTRAINT inv_reporting_request_kpi_uq UNIQUE (request_id, kpi_id);

-- ---------------------------------------------------------------------------
-- 4. Drop the old def tables (values first, then defs) and the bridge column.
-- ---------------------------------------------------------------------------
DROP TABLE inv_kpi_custom_value;
DROP TABLE inv_kpi_custom;
DROP TABLE inv_kpi_catalog;

-- Scope-check functions from the old value/def tables are now orphaned.
DROP FUNCTION IF EXISTS inv_kpi_custom_value_scope_check();
DROP FUNCTION IF EXISTS inv_kpi_custom_company_immutable();

ALTER TABLE inv_kpi DROP COLUMN legacy_custom_id;

-- ---------------------------------------------------------------------------
-- 5. Triggers, tenancy guards, RLS.
-- ---------------------------------------------------------------------------
CREATE TRIGGER set_inv_kpi_updated_at BEFORE UPDATE ON inv_kpi
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- A value's KPI must be global (organization_id NULL) or belong to the value's
-- org. The composite FKs pin company/submission but not the KPI (its org can be
-- NULL, which a composite FK can't express), so enforce it here.
CREATE OR REPLACE FUNCTION inv_kpi_value_kpi_org_check()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    kpi_org UUID;
BEGIN
    SELECT organization_id INTO kpi_org FROM inv_kpi WHERE id = NEW.kpi_id;
    IF kpi_org IS NOT NULL AND kpi_org IS DISTINCT FROM NEW.organization_id THEN
        RAISE EXCEPTION 'KPI % belongs to another org, cannot store a value under org %',
            NEW.kpi_id, NEW.organization_id;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inv_kpi_value_kpi_org_trg ON inv_kpi_value;
CREATE CONSTRAINT TRIGGER inv_kpi_value_kpi_org_trg
    AFTER INSERT OR UPDATE ON inv_kpi_value
    FOR EACH ROW EXECUTE FUNCTION inv_kpi_value_kpi_org_check();

-- A portco value's period must match its submission's period (the row carries its
-- own period columns for uniform querying; keep them in step with the submission).
CREATE OR REPLACE FUNCTION inv_kpi_value_period_check()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    sub_year SMALLINT;
    sub_quarter SMALLINT;
BEGIN
    IF NEW.submission_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT period_year, period_quarter INTO sub_year, sub_quarter
        FROM inv_reporting_submission WHERE id = NEW.submission_id;
    IF NEW.period_year IS DISTINCT FROM sub_year
        OR NEW.period_quarter IS DISTINCT FROM sub_quarter THEN
        RAISE EXCEPTION
            'portco KPI value period (% Q%) does not match submission % period (% Q%)',
            NEW.period_year, NEW.period_quarter, NEW.submission_id, sub_year, sub_quarter;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inv_kpi_value_period_trg ON inv_kpi_value;
CREATE CONSTRAINT TRIGGER inv_kpi_value_period_trg
    AFTER INSERT OR UPDATE ON inv_kpi_value
    FOR EACH ROW EXECUTE FUNCTION inv_kpi_value_period_check();

-- RLS. inv_kpi: readable when global or in the caller's org; org rows are
-- writable only by KPI admins (clientAdmin 11 / postsigAdmin 2), matching the
-- app-layer gate on custom-KPI management — role-check style mirrors
-- inv_value_overrides. inv_kpi_value keeps org_access (service-role portco
-- writes bypass RLS).
ALTER TABLE inv_kpi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_global_or_org" ON inv_kpi;
CREATE POLICY "read_global_or_org" ON inv_kpi FOR SELECT TO authenticated
    USING (organization_id IS NULL OR organization_id = public.user_organization_id());

DROP POLICY IF EXISTS "org_write" ON inv_kpi;
CREATE POLICY "org_write" ON inv_kpi FOR ALL
    USING (
        organization_id = public.user_organization_id()
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = ANY (ARRAY[11, 2])
        )
    )
    WITH CHECK (
        organization_id = public.user_organization_id()
        AND EXISTS (
            SELECT 1 FROM user_roles2 ur
            WHERE ur.user_id = auth.uid() AND ur.role_id = ANY (ARRAY[11, 2])
        )
    );
