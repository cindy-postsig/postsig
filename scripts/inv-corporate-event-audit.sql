-- Audit of merger / acquisition relationships recorded by workaround before
-- corporate events existed. Read-only: every statement is a SELECT. One row
-- per candidate company and signal, for a human to turn into
-- inv_corporate_event rows (or to dismiss).
--
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/inv-corporate-event-audit.sql
--
-- Signals
--   exit_status        inv_company.status is exited_merger or exited_acquisition
--   registry_pointer   the global inv_companies row says merged_into_company_id;
--                      hint names the target company
--   text_hint          tags, notes or investment thesis mention a merger,
--                      acquisition, spin-off, roll-up, holdco or redomicile;
--                      hint is the matched text
--   already_modelled   the company is already a party on a corporate event, so
--                      the report converges as events are created
--
-- Columns: organization_id, company_id, company_name, status, signal, hint

\set ON_ERROR_STOP on

WITH named AS (
    SELECT ic.id            AS company_id,
           ic.organization_id,
           ic.company_id    AS global_company_id,
           ic.status,
           ic.tags,
           ic.notes,
           ic.investment_thesis,
           COALESCE(ic.name_override, gc.name) AS company_name,
           gc.merged_into_company_id
      FROM inv_company ic
      JOIN inv_companies gc ON gc.id = ic.company_id
),
modelled AS (
    SELECT DISTINCT company_id FROM inv_corporate_event_party
),
exit_status AS (
    SELECT n.organization_id, n.company_id, n.company_name, n.status,
           'exit_status'::text AS signal,
           n.status            AS hint
      FROM named n
     WHERE n.status IN ('exited_merger', 'exited_acquisition')
),
registry_pointer AS (
    SELECT n.organization_id, n.company_id, n.company_name, n.status,
           'registry_pointer'::text AS signal,
           'merged into ' || COALESCE(tgt.name, '#' || n.merged_into_company_id::text) AS hint
      FROM named n
      LEFT JOIN inv_companies tgt ON tgt.id = n.merged_into_company_id
     WHERE n.merged_into_company_id IS NOT NULL
),
text_hint AS (
    SELECT n.organization_id, n.company_id, n.company_name, n.status,
           'text_hint'::text AS signal,
           substring(m.source FROM '(?i)[^.;]*(?:merg|acqui|spin|roll-?up|holdco|redomicil)[^.;]*') AS hint
      FROM named n
      CROSS JOIN LATERAL (
          SELECT concat_ws(' | ',
                           array_to_string(n.tags, ' '),
                           n.notes,
                           n.investment_thesis) AS source
      ) m
     WHERE m.source ~* '(merg|acqui|spin|roll-?up|holdco|redomicil)'
),
candidates AS (
    SELECT * FROM exit_status
    UNION ALL SELECT * FROM registry_pointer
    UNION ALL SELECT * FROM text_hint
)
SELECT c.organization_id,
       c.company_id,
       c.company_name,
       c.status,
       CASE WHEN md.company_id IS NOT NULL THEN 'already_modelled' ELSE c.signal END AS signal,
       c.hint
  FROM candidates c
  LEFT JOIN modelled md ON md.company_id = c.company_id
 ORDER BY c.organization_id, c.company_id, signal, c.hint;
