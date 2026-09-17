-- Cost is gross capital deployed, and exited companies report 0.
--
-- v_inv_position: drop the HAVING (sum(units) >= 0) clause so a (fund,
-- security, currency) group whose units net negative -- a position fully
-- transferred out or written off -- still contributes its purchase-side cost.
-- Dropping the group dropped its cost with it, understating aggregate_cost.
-- v_inv_position is CREATE OR REPLACE'd rather than dropped, because both
-- v_inv_fund_summary and v_inv_company_valuation depend on it; its 18 output
-- columns, their names, types and order are unchanged. v_inv_company_valuation
-- is dropped and recreated below, since nothing depends on it in turn.
--
-- total_units may now be negative for such a group. avg_cost_per_unit's
-- sum(units) > 0 guard prevents a division by zero but yields 0, not NULL, so
-- a newly admitted net-negative group reports avg_cost_per_unit 0 despite real
-- total_cost; no TypeScript consumer reads that column at all today.
-- v_inv_fund_summary aggregates over every v_inv_position row, so its
-- total_invested gains the recovered cost (the point of this migration),
-- total_units can go negative, and companies_count / positions_count now
-- count fully transferred-out or written-off groups as live positions --
-- whether those two counts should keep excluding them is a separate question,
-- to be answered in v_inv_fund_summary rather than by restoring the HAVING.
--
-- 'exit_consideration' is a return of capital: it counts in realized_proceeds
-- and never in total_cost, so an exit payout is not mistaken for capital
-- deployed. POSITION_PROCEEDS_TRANSACTION_TYPES mirrors this filter.
--
-- v_inv_company_valuation: aggregate_cost is 0 and multiple is NULL once
-- inv_company.status is anything other than 'active'. A company with no
-- position groups at all keeps NULL aggregate_cost. Recreated from
-- 20260902120000_widen_v_inv_company_valuation_entry_types.sql with exactly
-- those two expressions changed; every other column, lateral and the column
-- order are byte-identical to that file.

set check_function_bodies = off;

create or replace view "public"."v_inv_position" as  SELECT t.organization_id,
    t.fund_id,
    f.name AS fund_name,
    t.company_id,
    ic.company_id AS global_company_id,
    COALESCE(ic.name_override, gc.name) AS company_name,
    gc.domain AS company_domain,
    ic.status AS company_status,
    t.security_id,
    s.name AS security_name,
    s.security_type,
    sum(t.units) AS total_units,
    COALESCE((- sum(t.amount) FILTER (WHERE (t.transaction_type = ANY (ARRAY['purchase'::text, 'exercise'::text, 'secondary_purchase'::text, 'issuance'::text])))), (0)::numeric) AS total_cost,
    COALESCE(sum(t.amount) FILTER (WHERE (t.transaction_type = ANY (ARRAY['sale'::text, 'secondary_sale'::text, 'redemption'::text, 'exit'::text, 'exit_consideration'::text, 'distribution'::text, 'dividend'::text]))), (0)::numeric) AS realized_proceeds,
        CASE
            WHEN (sum(t.units) > (0)::numeric) THEN (COALESCE((- sum(t.amount) FILTER (WHERE (t.transaction_type = ANY (ARRAY['purchase'::text, 'exercise'::text, 'secondary_purchase'::text, 'issuance'::text])))), (0)::numeric) / sum(t.units))
            ELSE (0)::numeric
        END AS avg_cost_per_unit,
    min(t.transaction_date) AS first_acquired,
    max(t.transaction_date) AS last_transaction,
    t.currency
   FROM ((((public.inv_transaction t
     JOIN public.inv_fund f ON ((f.id = t.fund_id)))
     JOIN public.inv_company ic ON ((ic.id = t.company_id)))
     JOIN public.inv_companies gc ON ((gc.id = ic.company_id)))
     JOIN public.inv_security s ON ((s.id = t.security_id)))
  GROUP BY t.organization_id, t.fund_id, f.name, t.company_id, ic.company_id, ic.name_override, gc.name, gc.domain, ic.status, t.security_id, s.name, s.security_type, t.currency;

drop view if exists "public"."v_inv_company_valuation";

create or replace view "public"."v_inv_company_valuation" as  SELECT ic.id AS company_id,
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
        CASE
            WHEN (ic.status = 'active'::text) THEN pos.total_cost
            WHEN (pos.total_cost IS NULL) THEN NULL::numeric
            ELSE (0)::numeric
        END AS aggregate_cost,
    pos.realized_proceeds,
        CASE
            WHEN ((ic.status = 'active'::text) AND (pos.total_cost > (0)::numeric)) THEN ((cs.our_fd_ownership_percent * cs.implied_valuation) / pos.total_cost)
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
   FROM (((((((((public.inv_company ic
     JOIN public.inv_companies gc ON ((gc.id = ic.company_id)))
     LEFT JOIN LATERAL ( SELECT inv_cap_table_snapshot.id,
            inv_cap_table_snapshot.organization_id,
            inv_cap_table_snapshot.company_id,
            inv_cap_table_snapshot.financing_round_id,
            inv_cap_table_snapshot.external_id,
            inv_cap_table_snapshot.snapshot_date,
            inv_cap_table_snapshot.snapshot_type_id,
            inv_cap_table_snapshot.common_authorized,
            inv_cap_table_snapshot.common_outstanding,
            inv_cap_table_snapshot.preferred_authorized,
            inv_cap_table_snapshot.preferred_outstanding,
            inv_cap_table_snapshot.total_outstanding,
            inv_cap_table_snapshot.fully_diluted_total,
            inv_cap_table_snapshot.option_pool_authorized,
            inv_cap_table_snapshot.option_pool_outstanding,
            inv_cap_table_snapshot.option_pool_available,
            inv_cap_table_snapshot.option_pool_fd_percent,
            inv_cap_table_snapshot.our_common_shares,
            inv_cap_table_snapshot.our_preferred_shares,
            inv_cap_table_snapshot.our_total_shares,
            inv_cap_table_snapshot.our_ownership_percent,
            inv_cap_table_snapshot.our_fd_ownership_percent,
            inv_cap_table_snapshot.our_preferred_pct,
            inv_cap_table_snapshot.our_voting_pct,
            inv_cap_table_snapshot.share_price,
            inv_cap_table_snapshot.implied_valuation,
            inv_cap_table_snapshot.cap_table_detail,
            inv_cap_table_snapshot.created_at,
            inv_cap_table_snapshot.updated_at,
            inv_cap_table_snapshot.new_money_shares_issued,
            inv_cap_table_snapshot.conversion_shares_issued,
            inv_cap_table_snapshot.pre_money_preferred_outstanding
           FROM public.inv_cap_table_snapshot
          WHERE (inv_cap_table_snapshot.company_id = ic.id)
          ORDER BY inv_cap_table_snapshot.snapshot_date DESC
         LIMIT 1) cs ON (true))
     LEFT JOIN LATERAL ( SELECT s.code AS entry_stage_code,
            s.display_name AS entry_stage_display_name
           FROM (public.inv_financing_round fr
             JOIN public.inv_stages s ON ((s.id = fr.stage_id)))
          WHERE (fr.company_id = ic.id)
          ORDER BY COALESCE(fr.initial_close_date, fr.announced_date, fr.final_close_date) NULLS LAST
         LIMIT 1) earliest_round ON (true))
     LEFT JOIN LATERAL ( SELECT s.code AS current_stage_code,
            s.display_name AS current_stage_display_name
           FROM (public.inv_financing_round fr
             JOIN public.inv_stages s ON ((s.id = fr.stage_id)))
          WHERE (fr.company_id = ic.id)
          ORDER BY COALESCE(fr.initial_close_date, fr.announced_date, fr.final_close_date) DESC NULLS LAST
         LIMIT 1) latest_round ON (true))
     LEFT JOIN LATERAL ( SELECT t.transaction_date AS entry_date,
            t.amount AS entry_amount,
            s.code AS entry_stage_code,
            s.display_name AS entry_stage_display_name
           FROM ((public.inv_transaction t
             LEFT JOIN public.inv_financing_round fr ON ((fr.id = t.financing_round_id)))
             LEFT JOIN public.inv_stages s ON ((s.id = fr.stage_id)))
          WHERE ((t.company_id = ic.id) AND (t.transaction_type = ANY (ARRAY['purchase'::text, 'secondary_purchase'::text, 'issuance'::text, 'exercise'::text, 'conversion'::text])))
          ORDER BY t.transaction_date
         LIMIT 1) entry_tx ON (true))
     LEFT JOIN LATERAL ( SELECT s.code AS current_stage_code,
            s.display_name AS current_stage_display_name
           FROM ((public.inv_transaction t
             LEFT JOIN public.inv_financing_round fr ON ((fr.id = t.financing_round_id)))
             LEFT JOIN public.inv_stages s ON ((s.id = fr.stage_id)))
          WHERE ((t.company_id = ic.id) AND (t.transaction_type = ANY (ARRAY['purchase'::text, 'secondary_purchase'::text, 'issuance'::text, 'exercise'::text, 'conversion'::text])))
          ORDER BY t.transaction_date DESC
         LIMIT 1) latest_tx ON (true))
     LEFT JOIN LATERAL ( WITH fund_ids AS (
                 SELECT f_1.id,
                        min(t.transaction_date) FILTER (WHERE (t.transaction_type = ANY (ARRAY['purchase'::text, 'secondary_purchase'::text, 'issuance'::text, 'exercise'::text, 'conversion'::text]))) AS first_purchase_date
                   FROM (public.inv_transaction t
                     JOIN public.inv_fund f_1 ON ((f_1.id = t.fund_id)))
                  WHERE (t.company_id = ic.id)
                  GROUP BY f_1.id
                ), numbered AS (
                 SELECT fi.id,
                    row_number() OVER (ORDER BY fi.first_purchase_date NULLS LAST, fi.id) AS rn
                   FROM fund_ids fi
                )
         SELECT array_agg(numbered.id ORDER BY numbered.rn) AS fund_ids,
            array_agg(f.name ORDER BY numbered.rn) AS fund_names,
            array_agg(COALESCE(f.short_name, f.name) ORDER BY numbered.rn) AS fund_short_names,
            ( SELECT COALESCE(f2.short_name, f2.name) AS "coalesce"
                   FROM (public.inv_fund f2
                     JOIN public.inv_transaction t2 ON ((t2.fund_id = f2.id)))
                  WHERE ((t2.company_id = ic.id) AND (t2.transaction_type = ANY (ARRAY['purchase'::text, 'secondary_purchase'::text, 'issuance'::text, 'exercise'::text, 'conversion'::text])))
                  ORDER BY t2.transaction_date
                 LIMIT 1) AS primary_fund_short_name,
            ( SELECT f2.name
                   FROM (public.inv_fund f2
                     JOIN public.inv_transaction t2 ON ((t2.fund_id = f2.id)))
                  WHERE ((t2.company_id = ic.id) AND (t2.transaction_type = ANY (ARRAY['purchase'::text, 'secondary_purchase'::text, 'issuance'::text, 'exercise'::text, 'conversion'::text])))
                  ORDER BY t2.transaction_date
                 LIMIT 1) AS primary_fund_name
           FROM (numbered
             JOIN public.inv_fund f ON ((f.id = numbered.id)))) company_funds ON (true))
     LEFT JOIN ( SELECT v_inv_position.company_id,
            sum(v_inv_position.total_cost) AS total_cost,
            sum(v_inv_position.realized_proceeds) AS realized_proceeds,
            max(v_inv_position.last_transaction) AS last_transaction
           FROM public.v_inv_position
          GROUP BY v_inv_position.company_id) pos ON ((pos.company_id = ic.id)))
     LEFT JOIN ( SELECT fr.company_id,
            sum(fr.total_raised) AS total_equity_financing
           FROM public.inv_financing_round fr
          GROUP BY fr.company_id) rounds ON ((rounds.company_id = ic.id)));

ALTER VIEW public.v_inv_position SET (security_invoker = true);

ALTER VIEW public.v_inv_company_valuation SET (security_invoker = true);
