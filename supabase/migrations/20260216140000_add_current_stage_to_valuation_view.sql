DROP VIEW IF EXISTS v_inv_company_valuation;

CREATE OR REPLACE VIEW v_inv_company_valuation
WITH (security_invoker = true)
AS
SELECT ic.id AS company_id,
    ic.organization_id,
    ic.company_id AS global_company_id,
    COALESCE(ic.name_override, gc.name) AS company_name,
    gc.domain AS company_domain,
    gc.industry,
    gc.headquarters,
    ic.status,
    ic.sector,
    cs.snapshot_date,
    cs.share_price AS current_price_unit,
    cs.our_total_shares AS my_units,
    cs.our_fd_ownership_percent AS my_fd_pct,
    cs.our_fd_ownership_percent AS ownership_pct,
    cs.fully_diluted_total,
    cs.implied_valuation AS post_money_valuation,
    (cs.our_fd_ownership_percent * cs.implied_valuation) AS my_fmv,
    pos.total_cost AS aggregate_cost,
    CASE
      WHEN (pos.total_cost > (0)::numeric) THEN ((cs.our_fd_ownership_percent * cs.implied_valuation) / pos.total_cost)
      ELSE NULL::numeric
    END AS multiple,
    rounds.total_equity_financing,
    pos.last_transaction AS last_transaction_date,
    entry_tx.entry_date,
    entry_tx.entry_amount,
    COALESCE(earliest_round.entry_stage_code, entry_tx.entry_stage_code) AS entry_stage_code,
    COALESCE(earliest_round.entry_stage_display_name, entry_tx.entry_stage_display_name) AS entry_stage_display_name,
    COALESCE(latest_round.current_stage_code, latest_tx.current_stage_code) AS current_stage_code,
    COALESCE(latest_round.current_stage_display_name, latest_tx.current_stage_display_name) AS current_stage_display_name,
    company_funds.fund_ids,
    company_funds.fund_names,
    company_funds.fund_short_names,
    company_funds.primary_fund_short_name,
    company_funds.primary_fund_name
FROM public.inv_company ic
JOIN public.inv_companies gc ON gc.id = ic.company_id
LEFT JOIN LATERAL (
  SELECT *
  FROM public.inv_cap_table_snapshot
  WHERE inv_cap_table_snapshot.company_id = ic.id
  ORDER BY inv_cap_table_snapshot.snapshot_date DESC
  LIMIT 1
) cs ON true
LEFT JOIN LATERAL (
  SELECT s.code AS entry_stage_code,
         s.display_name AS entry_stage_display_name
  FROM public.inv_financing_round fr
  JOIN public.inv_stages s ON s.id = fr.stage_id
  WHERE fr.company_id = ic.id
  ORDER BY COALESCE(fr.initial_close_date, fr.announced_date, fr.final_close_date)
  LIMIT 1
) earliest_round ON true
LEFT JOIN LATERAL (
  SELECT s.code AS current_stage_code,
         s.display_name AS current_stage_display_name
  FROM public.inv_financing_round fr
  JOIN public.inv_stages s ON s.id = fr.stage_id
  WHERE fr.company_id = ic.id
  ORDER BY COALESCE(fr.initial_close_date, fr.announced_date, fr.final_close_date) DESC NULLS LAST
  LIMIT 1
) latest_round ON true
LEFT JOIN LATERAL (
  SELECT t.transaction_date AS entry_date,
         t.amount AS entry_amount,
         s.code AS entry_stage_code,
         s.display_name AS entry_stage_display_name
  FROM public.inv_transaction t
  LEFT JOIN public.inv_financing_round fr ON fr.id = t.financing_round_id
  LEFT JOIN public.inv_stages s ON s.id = fr.stage_id
  WHERE t.company_id = ic.id
    AND t.transaction_type = 'purchase'::text
  ORDER BY t.transaction_date
  LIMIT 1
) entry_tx ON true
LEFT JOIN LATERAL (
  SELECT s.code AS current_stage_code,
         s.display_name AS current_stage_display_name
  FROM public.inv_transaction t
  LEFT JOIN public.inv_financing_round fr ON fr.id = t.financing_round_id
  LEFT JOIN public.inv_stages s ON s.id = fr.stage_id
  WHERE t.company_id = ic.id
    AND t.transaction_type = 'purchase'::text
  ORDER BY t.transaction_date DESC
  LIMIT 1
) latest_tx ON true
LEFT JOIN LATERAL (
  WITH fund_ids AS (
    SELECT DISTINCT f_1.id
    FROM public.inv_transaction t
    JOIN public.inv_fund f_1 ON f_1.id = t.fund_id
    WHERE t.company_id = ic.id
  ), numbered AS (
    SELECT fi.id,
           row_number() OVER () AS rn
    FROM fund_ids fi
  )
  SELECT array_agg(numbered.id ORDER BY numbered.rn) AS fund_ids,
         array_agg(f.name ORDER BY numbered.rn) AS fund_names,
         array_agg(COALESCE(f.short_name, f.name) ORDER BY numbered.rn) AS fund_short_names,
         (
           SELECT COALESCE(f2.short_name, f2.name)
           FROM public.inv_fund f2
           JOIN public.inv_transaction t2 ON t2.fund_id = f2.id
           WHERE t2.company_id = ic.id
             AND t2.transaction_type = 'purchase'::text
           ORDER BY t2.transaction_date
           LIMIT 1
         ) AS primary_fund_short_name,
         (
           SELECT f2.name
           FROM public.inv_fund f2
           JOIN public.inv_transaction t2 ON t2.fund_id = f2.id
           WHERE t2.company_id = ic.id
             AND t2.transaction_type = 'purchase'::text
           ORDER BY t2.transaction_date
           LIMIT 1
         ) AS primary_fund_name
  FROM numbered
  JOIN public.inv_fund f ON f.id = numbered.id
) company_funds ON true
LEFT JOIN (
  SELECT v_inv_position.company_id,
         sum(v_inv_position.total_cost) AS total_cost,
         max(v_inv_position.last_transaction) AS last_transaction
  FROM public.v_inv_position
  GROUP BY v_inv_position.company_id
) pos ON pos.company_id = ic.id
LEFT JOIN (
  SELECT fr.company_id,
         SUM(fr.total_raised) AS total_equity_financing
  FROM public.inv_financing_round fr
  GROUP BY fr.company_id
) rounds ON rounds.company_id = ic.id;