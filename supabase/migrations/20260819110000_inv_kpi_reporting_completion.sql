-- Reporting completion marker + the document picker's listing query.
--
-- Until now the KPI review save stamped module_documents.ai_extraction_status =
-- 'h_success' to record "these values landed in the database". That column
-- belongs to the regular extraction flow, which uses the same value to mean
-- "a human confirmed this contract extraction" — two different facts sharing one
-- column, and the investor documents table renders it. Worse, the marker is
-- document-global: one annual workbook saved for Q2 and not Q3 cannot be
-- described by it at all.
--
-- inv_kpi_reporting_completion records the fact on its own terms, keyed by
-- period, so the picker can answer "is this document done for the quarter I am
-- about to extract?" The save path writes here instead; the ai_extraction_status
-- write is removed in the same change.
--
-- No backfill. Rows written before this table existed left no period-accurate
-- trace (ai_extraction_status carries no period), so synthesising completions
-- from run history would assert something the data does not support. Documents
-- saved before this deploy simply show as extracted-but-not-saved until their
-- next save.

-- The composite unique key this table's FK references was introduced by
-- 20260811120000. That migration was edited after it had already run in some
-- databases, and the version table records it as applied, so those databases
-- will never pick the constraint up on their own — and the FK below then fails
-- with "no unique constraint matching given keys". Adding it here, guarded,
-- rather than editing applied history: no-ops where it already exists, repairs
-- it where it does not. Postgres has no ADD CONSTRAINT IF NOT EXISTS, hence the
-- catalog check.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'module_documents'::regclass
          AND conname = 'module_documents_id_org_uq'
    ) THEN
        ALTER TABLE module_documents
            ADD CONSTRAINT module_documents_id_org_uq UNIQUE (id, organization_id);
    END IF;
END
$$;

CREATE TABLE inv_kpi_reporting_completion (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id           UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

    module_document_id  BIGINT NOT NULL,
    organization_id     UUID NOT NULL,

    period_year         INTEGER NOT NULL,
    period_quarter      INTEGER NOT NULL,

    completed_by        UUID REFERENCES users(id) ON DELETE SET NULL,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT inv_kpi_reporting_completion_period_year_chk
        CHECK (period_year BETWEEN 2000 AND 2100),
    CONSTRAINT inv_kpi_reporting_completion_period_quarter_chk
        CHECK (period_quarter BETWEEN 1 AND 4),

    -- The save path upserts on this key, so a re-save of the same review
    -- converges on one row rather than accumulating duplicates.
    CONSTRAINT inv_kpi_reporting_completion_cell_uq
        UNIQUE (module_document_id, period_year, period_quarter),

    -- Pin the document to its organization: the save runs as the service role
    -- and bypasses RLS, so the pair is what stops a cross-org completion.
    CONSTRAINT inv_kpi_reporting_completion_document_org_fk
        FOREIGN KEY (module_document_id, organization_id)
        REFERENCES module_documents(id, organization_id) ON DELETE CASCADE
);

COMMENT ON TABLE inv_kpi_reporting_completion IS
    'One row per document+period whose reviewed KPI values were written to the database. Owned by the investor reporting flow; deliberately separate from module_documents.ai_extraction_status, which belongs to the regular extraction flow.';

-- The picker probes this per listed document, for one period.
CREATE INDEX idx_inv_kpi_reporting_completion_document
    ON inv_kpi_reporting_completion (module_document_id);

CREATE TRIGGER set_inv_kpi_reporting_completion_updated_at
    BEFORE UPDATE ON inv_kpi_reporting_completion
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

ALTER TABLE inv_kpi_reporting_completion ENABLE ROW LEVEL SECURITY;

-- Read-only for user contexts: every write goes through the droid save path
-- as the service role (which bypasses RLS), so a broader policy would only
-- let org members forge or erase completion markers.
DROP POLICY IF EXISTS "org_access" ON inv_kpi_reporting_completion;
CREATE POLICY "org_access" ON inv_kpi_reporting_completion FOR SELECT
    USING (organization_id = public.user_organization_id());


-- The document picker's listing query.
--
-- A parameterised function rather than a view because sorting, paging and the
-- exact count all have to happen in one indexed pass: a client that sorts the
-- returned page would only ever reorder one page of an arbitrary slice, and
-- ranking by extraction state means ranking by the derived flags below.
--
-- `saved` deliberately asks "has this document ever been saved", not "was it
-- saved for the period on screen". A per-period flag made a document that had
-- been saved read as untouched whenever the form sat on a different quarter —
-- the badge's absence is far more visible than its nuance, so the ambiguity
-- cost more than the precision bought. `saved_periods` carries the detail.
--
-- It also collapses what the API did in up to four round trips into one: the
-- search previously resolved file names and company names to parent ids in
-- separate queries first, because a PostgREST `or` cannot span an embedded
-- table. Plain SQL has no such limitation.
--
-- Cross-org by design: extraction roles work across every client organization,
-- so p_organization_id is a filter the analyst chose, not an access bound. The
-- caller (droid, service role) enforces the role check.
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
                    jsonb_build_object('year', c.period_year,
                                       'quarter', c.period_quarter)
                    ORDER BY c.period_year, c.period_quarter)
         FROM inv_kpi_reporting_completion c
         WHERE c.module_document_id = p.id),
        '[]'::jsonb
    ) AS saved_periods,
    p.total
FROM paged p;
$$;

COMMENT ON FUNCTION kpi_extraction_documents_list IS
    'Paged, sortable investor document listing for the KPI extraction picker. `saved` is true when the document was saved for at least one period; `saved_periods` lists every completed period for the returned rows.';
