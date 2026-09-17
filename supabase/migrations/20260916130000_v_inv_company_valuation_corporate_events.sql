-- Corporate events feed the company valuation view.
--
-- v_inv_company_valuation is dropped and recreated from
-- 20260908120000_position_cost_gross_deployed.sql. Every pre-existing column
-- keeps its name, type and position; three columns are appended and the
-- aggregate_cost / multiple expressions change. v_inv_position and
-- v_inv_fund_summary are untouched.
--
-- Per company, evaluated at query time against CURRENT_DATE:
--
--   excluded_share  LEAST(1, sum over events E where the company is a
--                   predecessor and E.event_date <= today of the sum of
--                   cost_allocation_ratio over E's successor rows). 0 when the
--                   company is a predecessor of nothing.
--   carried_cost    sum over events E where the company is a successor with
--                   ratio r, E.event_date <= today and
--                   E.successor_cost_booked = false, of every predecessor's
--                   position cost times r. 0 otherwise.
--   ma_event_date   the earliest event_date where the company is a predecessor,
--                   regardless of date, so a future-dated event is visible.
--
-- aggregate_cost for an active company becomes
--   GREATEST(0, position_cost * (1 - excluded_share)) + carried_cost
-- and stays NULL when the company has no positions and nothing carried in.
-- Two rules: status precedes event (a non-active company reports 0 exactly as
-- before, whatever its events say), and future-dated events do not apply yet
-- (their shares and carried cost are 0 until event_date arrives). Companies
-- with no event evaluate excluded_share 0 and carried_cost 0, so their
-- aggregate_cost and multiple are unchanged.
--
-- Known limit: carried_cost reads each predecessor's own position cost, not
-- its event-adjusted cost, so a chain (A merged into B, B merged into C, both
-- with successor_cost_booked = false) carries A's cost to B but not on to C.
-- Chained events with unbooked successor cost need a recursive definition.

set check_function_bodies = off;

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
            WHEN (ic.status = 'active'::text) THEN
                CASE
                    WHEN ((pos.total_cost IS NULL) AND (ma.carried_cost = (0)::numeric)) THEN NULL::numeric
                    ELSE (GREATEST((0)::numeric, (COALESCE(pos.total_cost, (0)::numeric) * ((1)::numeric - ma.excluded_share))) + ma.carried_cost)
                END
            WHEN (pos.total_cost IS NULL) THEN NULL::numeric
            ELSE (0)::numeric
        END AS aggregate_cost,
    pos.realized_proceeds,
        CASE
            WHEN ((ic.status = 'active'::text) AND ((GREATEST((0)::numeric, (COALESCE(pos.total_cost, (0)::numeric) * ((1)::numeric - ma.excluded_share))) + ma.carried_cost) > (0)::numeric)) THEN ((cs.our_fd_ownership_percent * cs.implied_valuation) / (GREATEST((0)::numeric, (COALESCE(pos.total_cost, (0)::numeric) * ((1)::numeric - ma.excluded_share))) + ma.carried_cost))
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
    company_funds.primary_fund_name,
    ma.excluded_share AS ma_excluded_share,
    ma.carried_cost AS ma_carried_cost,
    ma.event_date AS ma_event_date
   FROM ((((((((((public.inv_company ic
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
          GROUP BY fr.company_id) rounds ON ((rounds.company_id = ic.id)))
     LEFT JOIN LATERAL ( SELECT LEAST((1)::numeric, COALESCE(( SELECT sum(sr.cost_allocation_ratio) AS sum
                   FROM ((public.inv_corporate_event_party pp
                     JOIN public.inv_corporate_event e ON ((e.id = pp.event_id)))
                     JOIN public.inv_corporate_event_party sr ON (((sr.event_id = e.id) AND (sr.role = 'successor'::text))))
                  WHERE ((pp.company_id = ic.id) AND (pp.role = 'predecessor'::text) AND (e.event_date <= CURRENT_DATE))), (0)::numeric)) AS excluded_share,
            COALESCE(( SELECT sum((COALESCE(ppos.total_cost, (0)::numeric) * sp.cost_allocation_ratio)) AS sum
                   FROM (((public.inv_corporate_event_party sp
                     JOIN public.inv_corporate_event e ON ((e.id = sp.event_id)))
                     JOIN public.inv_corporate_event_party pr ON (((pr.event_id = e.id) AND (pr.role = 'predecessor'::text))))
                     LEFT JOIN ( SELECT v_inv_position.company_id,
                            sum(v_inv_position.total_cost) AS total_cost
                           FROM public.v_inv_position
                          GROUP BY v_inv_position.company_id) ppos ON ((ppos.company_id = pr.company_id)))
                  WHERE ((sp.company_id = ic.id) AND (sp.role = 'successor'::text) AND (e.event_date <= CURRENT_DATE) AND (e.successor_cost_booked = false))), (0)::numeric) AS carried_cost,
            ( SELECT min(e.event_date) AS min
                   FROM (public.inv_corporate_event_party pp
                     JOIN public.inv_corporate_event e ON ((e.id = pp.event_id)))
                  WHERE ((pp.company_id = ic.id) AND (pp.role = 'predecessor'::text))) AS event_date) ma ON (true));

ALTER VIEW public.v_inv_company_valuation SET (security_invoker = true);
