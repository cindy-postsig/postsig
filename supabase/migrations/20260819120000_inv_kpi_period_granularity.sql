-- Period granularity for KPI values and extraction (psk-1906 follow-on).
--
-- Documents don't all report quarterly: an annual report carries FY figures,
-- a monthly pack carries months, and one workbook can carry several periods at
-- once. inv_kpi_value already half-supports this — NULL period_quarter has
-- meant "annual" since 20260720120000 — but the convention is implicit, months
-- are unrepresentable, and the extraction-side tables
-- (inv_kpi_extraction_run, inv_kpi_reporting_completion) hard-require a
-- quarter.
--
-- This migration makes granularity explicit and month-capable:
--   * period_month on all three tables, mutually exclusive with
--     period_quarter (month set = monthly, quarter set = quarterly, both
--     NULL = annual);
--   * period_type as a GENERATED column deriving that reading. Generated
--     rather than written: it cannot drift from the period columns, needs no
--     backfill, and writers that predate this migration keep inserting
--     unchanged. Application code must never write it.
--   * inv_kpi_period_discovery, the job row for the new discovery pass that
--     asks "which periods does this document contain?" before any extraction
--     run is created.
--
-- Expand/contract: the widened unique keys are ADDED here and the old ones
-- KEPT, so code deployed against the old 5-column conflict target keeps
-- upserting until every consumer is released. 20260819130000 drops the old
-- keys; monthly rows only become storable then, because the old
-- NULLS NOT DISTINCT key reads two months of one year (both quarter-NULL) as
-- the same cell.

-- ---------------------------------------------------------------------------
-- inv_kpi_value
-- ---------------------------------------------------------------------------

ALTER TABLE inv_kpi_value
    ADD COLUMN period_month SMALLINT,
    ADD COLUMN period_type TEXT GENERATED ALWAYS AS (
        CASE WHEN period_month IS NOT NULL THEN 'month'
             WHEN period_quarter IS NOT NULL THEN 'quarter'
             ELSE 'annual'
        END
    ) STORED,
    ADD CONSTRAINT inv_kpi_value_period_month_chk
        CHECK (period_month IS NULL OR period_month BETWEEN 1 AND 12),
    -- A row is one period at one granularity; carrying both a quarter and a
    -- month would make it two.
    ADD CONSTRAINT inv_kpi_value_period_excl_chk
        CHECK (period_month IS NULL OR period_quarter IS NULL),
    -- The widened cell key. period_type stays out: it is fully derived from
    -- two columns that are already in the key.
    ADD CONSTRAINT inv_kpi_value_cell_v2_uq
        UNIQUE NULLS NOT DISTINCT
        (kpi_id, company_id, period_year, period_quarter, period_month, origin);
    -- inv_kpi_value_cell_uq (the 5-column key) is deliberately kept — see the
    -- header. Dropped by 20260819130000.

COMMENT ON COLUMN inv_kpi_value.period_type IS
    'Derived granularity: month set = ''month'', quarter set = ''quarter'', both NULL = ''annual''. Generated — never written by application code.';

-- ---------------------------------------------------------------------------
-- inv_kpi_extraction_run
-- ---------------------------------------------------------------------------

-- The existing period_quarter CHECK (BETWEEN 1 AND 4) passes NULL by SQL
-- semantics, so dropping NOT NULL is all the relaxation the quarter needs.
ALTER TABLE inv_kpi_extraction_run
    ALTER COLUMN period_quarter DROP NOT NULL,
    ADD COLUMN period_month SMALLINT,
    ADD COLUMN period_type TEXT GENERATED ALWAYS AS (
        CASE WHEN period_month IS NOT NULL THEN 'month'
             WHEN period_quarter IS NOT NULL THEN 'quarter'
             ELSE 'annual'
        END
    ) STORED,
    ADD CONSTRAINT inv_kpi_extraction_run_period_month_chk
        CHECK (period_month IS NULL OR period_month BETWEEN 1 AND 12),
    ADD CONSTRAINT inv_kpi_extraction_run_period_excl_chk
        CHECK (period_month IS NULL OR period_quarter IS NULL);

COMMENT ON COLUMN inv_kpi_extraction_run.period_type IS
    'Derived granularity: month set = ''month'', quarter set = ''quarter'', both NULL = ''annual''. Generated — never written by application code.';

-- ---------------------------------------------------------------------------
-- inv_kpi_reporting_completion
-- ---------------------------------------------------------------------------

ALTER TABLE inv_kpi_reporting_completion
    ALTER COLUMN period_quarter DROP NOT NULL,
    ADD COLUMN period_month SMALLINT,
    ADD COLUMN period_type TEXT GENERATED ALWAYS AS (
        CASE WHEN period_month IS NOT NULL THEN 'month'
             WHEN period_quarter IS NOT NULL THEN 'quarter'
             ELSE 'annual'
        END
    ) STORED,
    ADD CONSTRAINT inv_kpi_reporting_completion_period_month_chk
        CHECK (period_month IS NULL OR period_month BETWEEN 1 AND 12),
    ADD CONSTRAINT inv_kpi_reporting_completion_period_excl_chk
        CHECK (period_month IS NULL OR period_quarter IS NULL),
    -- The original cell key is a plain UNIQUE: with period_quarter now
    -- nullable it would let annual completions duplicate (NULLs distinct), so
    -- the save path moves to this key. The old key stays until
    -- 20260819130000; it is harmless meanwhile — quarter-NULL rows are all
    -- distinct under it.
    ADD CONSTRAINT inv_kpi_reporting_completion_cell_v2_uq
        UNIQUE NULLS NOT DISTINCT
        (module_document_id, period_year, period_quarter, period_month);

COMMENT ON COLUMN inv_kpi_reporting_completion.period_type IS
    'Derived granularity: month set = ''month'', quarter set = ''quarter'', both NULL = ''annual''. Generated — never written by application code.';

-- ---------------------------------------------------------------------------
-- inv_kpi_period_discovery
-- ---------------------------------------------------------------------------

-- Job row for the discovery pass. Same delivery model as
-- inv_kpi_extraction_run: Inngest run state is not reliable enough to poll,
-- so the droid persists the outcome here and the UI polls this row. `result`
-- is the droid's payload, stored opaquely — its shape is owned by the droid
-- contract ({ periods: [{periodType, year, quarter, month}], notes }).
--
-- company_id is nullable, unlike the run table: discovery can be triggered
-- before the analyst resolves a company, because it reads the document, not
-- the company.
CREATE TABLE inv_kpi_period_discovery (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id           UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

    module_document_id  BIGINT NOT NULL,
    company_id          BIGINT,
    organization_id     UUID NOT NULL,

    status              TEXT NOT NULL DEFAULT 'queued',
    result              JSONB,
    error               TEXT,
    model_id            TEXT,

    requested_by        UUID REFERENCES users(id) ON DELETE SET NULL,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT inv_kpi_period_discovery_status_chk
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),

    -- Pin the document to its organization (droid writes as the service role
    -- and bypasses RLS).
    CONSTRAINT inv_kpi_period_discovery_document_org_fk
        FOREIGN KEY (module_document_id, organization_id)
        REFERENCES module_documents(id, organization_id) ON DELETE CASCADE,

    -- Same pin for the company when one was resolved at trigger time.
    CONSTRAINT inv_kpi_period_discovery_company_org_fk
        FOREIGN KEY (company_id, organization_id)
        REFERENCES inv_company(id, organization_id) ON DELETE CASCADE
);

COMMENT ON TABLE inv_kpi_period_discovery IS
    'One row per period-discovery job: which reporting periods does a document contain? Result feeds the analyst''s period confirmation before extraction runs are created.';

-- Droid picks up work by status; terminal rows are never scanned by it.
CREATE INDEX idx_inv_kpi_period_discovery_status ON inv_kpi_period_discovery (status)
    WHERE status IN ('queued', 'running');
-- The trigger page asks for the latest discovery per document.
CREATE INDEX idx_inv_kpi_period_discovery_document
    ON inv_kpi_period_discovery (module_document_id);

CREATE TRIGGER set_inv_kpi_period_discovery_updated_at
    BEFORE UPDATE ON inv_kpi_period_discovery
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

ALTER TABLE inv_kpi_period_discovery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access" ON inv_kpi_period_discovery;
CREATE POLICY "org_access" ON inv_kpi_period_discovery FOR ALL
    USING (organization_id = public.user_organization_id())
    WITH CHECK (organization_id = public.user_organization_id());

-- ---------------------------------------------------------------------------
-- kpi_extraction_documents_list: saved_periods carries granularity
-- ---------------------------------------------------------------------------

-- Body identical to 20260814120000 except saved_periods, whose entries gain
-- `type` and `month` alongside `year` and `quarter`. Within a year the order
-- is annual, then months, then quarters (quarter NULLS FIRST, month NULLS
-- FIRST) — consumers render the list verbatim.
CREATE OR REPLACE FUNCTION kpi_extraction_documents_list(
    p_search           TEXT,
    p_organization_id  UUID,
    p_file_kind        TEXT,
    -- 'saved' | 'extracted' | 'none'; NULL means every status. Filtered in the
    -- database rather than on the page, for the same reason sorting is: the
    -- page is one slice, so filtering it client-side would hide matches that
    -- simply fell on another page.
    p_status           TEXT,
    p_sort             TEXT,
    p_dir              TEXT,
    p_offset           INTEGER,
    p_limit            INTEGER
)
RETURNS TABLE (
    id                BIGINT,
    file_name         TEXT,
    file_kind         TEXT,
    company_id        BIGINT,
    company_name      TEXT,
    organization_id   UUID,
    organization_name TEXT,
    document_type     TEXT,
    created_at        TIMESTAMPTZ,
    extracted         BOOLEAN,
    saved             BOOLEAN,
    saved_periods     JSONB,
    total             BIGINT
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
WITH term AS (
    -- One place to normalise the search term: blank is "no search", and LIKE
    -- metacharacters are escaped so a literal '%' or '_' stays literal instead
    -- of matching every document.
    SELECT NULLIF(btrim(p_search), '') AS raw,
           replace(replace(replace(NULLIF(btrim(p_search), ''),
               '\', '\\'), '%', '\%'), '_', '\_') AS pattern
),
filtered AS (
    SELECT
        md.id,
        f.file_name,
        CASE WHEN lower(f.file_name) LIKE '%.pdf' THEN 'pdf' ELSE 'xlsx' END
            AS file_kind,
        md.company_id,
        ic_name.name AS company_name,
        md.organization_id,
        o.name AS organization_name,
        dt.name AS document_type,
        md.created_at,
        EXISTS (
            SELECT 1 FROM inv_kpi_extraction_run r
            WHERE r.module_document_id = md.id
              AND r.status = 'succeeded'
        ) AS extracted,
        EXISTS (
            SELECT 1 FROM inv_kpi_reporting_completion c
            WHERE c.module_document_id = md.id
        ) AS saved
    FROM module_documents md
    CROSS JOIN term t
    -- Inner join: a document with no extractable file is not pickable. Only the
    -- lowest-id supported file is considered, matching the run worker's
    -- resolveSourceFile — both must agree on which file a run refers to.
    JOIN LATERAL (
        SELECT mdf.file_name
        FROM module_document_files mdf
        WHERE mdf.module_document_id = md.id
          AND (lower(mdf.file_name) LIKE '%.xlsx'
            OR lower(mdf.file_name) LIKE '%.pdf')
        ORDER BY mdf.id
        LIMIT 1
    ) f ON TRUE
    LEFT JOIN inv_company ic
        ON ic.id = md.company_id
       AND ic.organization_id = md.organization_id
    LEFT JOIN inv_companies ic_name ON ic_name.id = ic.company_id
    LEFT JOIN organizations o ON o.id = md.organization_id
    LEFT JOIN document_types dt ON dt.id = md.document_type_id
    WHERE md.module_id = 2
      AND md.is_deleted IS NOT TRUE
      AND (p_organization_id IS NULL OR md.organization_id = p_organization_id)
      AND (
          p_file_kind IS NULL
          OR lower(f.file_name) LIKE '%.' || lower(p_file_kind)
      )
      AND (
          t.raw IS NULL
          OR f.file_name ILIKE '%' || t.pattern || '%'
          OR ic_name.name ILIKE '%' || t.pattern || '%'
          -- '#412' and '412' both mean that document to an analyst. Matched on
          -- the exact id, so the term still has to be a plain number: a
          -- substring rule here would make '#4' pull in every id containing 4.
          OR (t.raw ~ '^#?[0-9]+$' AND md.id::TEXT = ltrim(t.raw, '#'))
      )
),
-- The status flags are derived in `filtered`, so they can only be filtered on
-- once that stage has produced them; `total` is counted after this narrowing so
-- the pager reports the filtered set rather than the whole corpus.
by_status AS (
    SELECT * FROM filtered fi
    WHERE p_status IS NULL
       OR (p_status = 'saved'     AND fi.saved)
       OR (p_status = 'extracted' AND fi.extracted AND NOT fi.saved)
       OR (p_status = 'none'      AND NOT fi.extracted AND NOT fi.saved)
),
paged AS (
    SELECT fi.*, count(*) OVER () AS total
    FROM by_status fi
    ORDER BY
        -- Text keys are left un-coalesced so a document with no type or no
        -- organization sorts last in both directions (NULLS LAST), rather than
        -- leading the ascending page as an empty string would.
        CASE WHEN p_dir = 'asc' THEN
            CASE p_sort
                WHEN 'fileName'     THEN lower(fi.file_name)
                WHEN 'type'         THEN lower(fi.document_type)
                WHEN 'organization' THEN lower(fi.organization_name)
            END
        END ASC NULLS LAST,
        CASE WHEN p_dir <> 'asc' THEN
            CASE p_sort
                WHEN 'fileName'     THEN lower(fi.file_name)
                WHEN 'type'         THEN lower(fi.document_type)
                WHEN 'organization' THEN lower(fi.organization_name)
            END
        END DESC NULLS LAST,
        CASE WHEN p_dir = 'asc' AND p_sort = 'createdAt'
             THEN fi.created_at END ASC NULLS LAST,
        CASE WHEN p_dir <> 'asc' AND p_sort = 'createdAt'
             THEN fi.created_at END DESC NULLS LAST,
        -- none < extracted < saved
        CASE WHEN p_dir = 'asc' AND p_sort = 'extraction' THEN
            (CASE WHEN fi.saved THEN 2 WHEN fi.extracted THEN 1 ELSE 0 END)
        END ASC NULLS LAST,
        CASE WHEN p_dir <> 'asc' AND p_sort = 'extraction' THEN
            (CASE WHEN fi.saved THEN 2 WHEN fi.extracted THEN 1 ELSE 0 END)
        END DESC NULLS LAST,
        -- Total order: without a unique tiebreaker, rows tied on the sort key
        -- can repeat or vanish across pages.
        fi.id DESC
    OFFSET p_offset
    -- Bounded: LIMIT NULL means "all rows", so a missing p_limit must not turn
    -- one page into the whole corpus. The API pages by 50; 200 is headroom.
    LIMIT LEAST(COALESCE(p_limit, 50), 200)
)
-- saved_periods drives a tooltip, so it is aggregated only for the rows the
-- page actually returns rather than for every filtered candidate.
SELECT
    p.id,
    p.file_name,
    p.file_kind,
    p.company_id,
    p.company_name,
    p.organization_id,
    p.organization_name,
    p.document_type,
    p.created_at,
    p.extracted,
    p.saved,
    COALESCE(
        (SELECT jsonb_agg(
                    jsonb_build_object('type', c.period_type,
                                       'year', c.period_year,
                                       'quarter', c.period_quarter,
                                       'month', c.period_month)
                    ORDER BY c.period_year,
                             c.period_quarter NULLS FIRST,
                             c.period_month NULLS FIRST)
         FROM inv_kpi_reporting_completion c
         WHERE c.module_document_id = p.id),
        '[]'::jsonb
    ) AS saved_periods,
    p.total
FROM paged p;
$$;

COMMENT ON FUNCTION kpi_extraction_documents_list IS
    'Paged, sortable investor document listing for the KPI extraction picker. `saved` answers whether the document was ever saved for any period; `saved_periods` lists every completed period (with granularity) for the returned rows.';
