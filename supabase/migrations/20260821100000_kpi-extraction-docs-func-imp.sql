create extension if not exists pg_trgm;

create index if not exists mdf_file_name_trgm_idx
  on module_document_files using gin (lower(file_name) gin_trgm_ops);

create index if not exists inv_companies_name_trgm_idx
  on inv_companies using gin (lower(name) gin_trgm_ops);

create index if not exists mdf_docid_id_idx
  on module_document_files (module_document_id, id);

create index if not exists mdf_docid_lower_file_idx
  on module_document_files (module_document_id, lower(file_name), id);

create index if not exists iker_module_status_idx
  on inv_kpi_extraction_run (module_document_id, status);


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
          OR f.file_name ILIKE '%' || t.pattern || '%' ESCAPE '\'
          OR ic_name.name ILIKE '%' || t.pattern || '%' ESCAPE '\'
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