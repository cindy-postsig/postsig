drop view if exists "public"."investor_party_summary";

drop view if exists "public"."investor_portfolio_metrics";

alter table "public"."investor_events" disable row level security;

alter table "public"."investor_stages" disable row level security;

set check_function_bodies = off;

create or replace view "public"."investor_party_summary" as  WITH party_participation AS (
         SELECT icp.party_id,
            ip.organization_id,
            ip.name AS party_name,
            ip.party_type,
            ip.email,
            ife.entity_id,
            me.name AS entity_name,
            count(DISTINCT ife.id) AS rounds_participated,
            count(DISTINCT ic.id) AS closings_participated,
            sum(icp.amount_paid) AS total_invested,
            min(ic.close_date) AS first_investment_date,
            max(ic.close_date) AS last_investment_date,
            array_agg(DISTINCT s.display_name) FILTER (WHERE (s.display_name IS NOT NULL)) AS rounds
           FROM (((((public.investor_closing_participant icp
             JOIN public.investor_party ip ON ((ip.id = icp.party_id)))
             JOIN public.investor_closing ic ON ((ic.id = icp.closing_id)))
             JOIN public.investor_financing_event ife ON ((ife.id = ic.event_id)))
             JOIN public.module_entities me ON ((me.id = ife.entity_id)))
             LEFT JOIN public.investor_stages s ON ((s.id = ife.stage_id)))
          GROUP BY icp.party_id, ip.organization_id, ip.name, ip.party_type, ip.email, ife.entity_id, me.name
        ), party_rights AS (
         SELECT DISTINCT ON (isec.entity_id, ipl.party_id) ipl.party_id,
            isec.entity_id,
            (istv.terms ->> 'major_investor'::text) AS major_investor,
            (istv.terms ->> 'information_rights'::text) AS information_rights,
            (istv.terms ->> 'pro_rata_rights'::text) AS pro_rata_rights,
            (istv.terms ->> 'qsbs_qualified'::text) AS qsbs_qualified,
            istv.anti_dilution_type,
            istv.liquidation_preference_multiple
           FROM ((public.investor_position_lot ipl
             JOIN public.investor_security isec ON ((isec.id = ipl.security_id)))
             LEFT JOIN public.investor_security_terms_version istv ON ((istv.security_id = isec.id)))
          ORDER BY isec.entity_id, ipl.party_id, istv.effective_date DESC NULLS LAST
        ), board_seats AS (
         SELECT ibr.party_id,
            ibr.entity_id,
            count(*) FILTER (WHERE ((ibr.end_date IS NULL) OR (ibr.end_date > CURRENT_DATE))) AS active_board_seats,
            array_agg(DISTINCT ibr.seat_type) FILTER (WHERE ((ibr.end_date IS NULL) OR (ibr.end_date > CURRENT_DATE))) AS seat_types
           FROM public.investor_board_representation ibr
          GROUP BY ibr.party_id, ibr.entity_id
        )
 SELECT pp.party_id,
    pp.organization_id,
    pp.party_name,
    pp.party_type,
    pp.email,
    pp.entity_id,
    pp.entity_name,
    pp.rounds_participated,
    pp.closings_participated,
    pp.total_invested,
    pp.first_investment_date,
    pp.last_investment_date,
    pp.rounds,
    pr.major_investor,
    pr.information_rights,
    pr.pro_rata_rights,
    pr.qsbs_qualified,
    pr.anti_dilution_type,
    pr.liquidation_preference_multiple,
    COALESCE(bs.active_board_seats, (0)::bigint) AS active_board_seats,
    bs.seat_types
   FROM ((party_participation pp
     LEFT JOIN party_rights pr ON (((pr.party_id = pp.party_id) AND (pr.entity_id = pp.entity_id))))
     LEFT JOIN board_seats bs ON (((bs.party_id = pp.party_id) AND (bs.entity_id = pp.entity_id))));


create or replace view "public"."investor_portfolio_metrics" as  WITH position_totals AS (
         SELECT ipl.party_id,
            ip.organization_id,
            ip.name AS party_name,
            isec_1.entity_id,
            me.name AS entity_name,
            isec_1.security_type,
            isec_1.series_name,
            sum(ipl.units) AS total_units,
            sum(ipl.total_cost) AS aggregate_cost,
            min(ipl.acquired_date) AS first_acquired_date,
            max(ipl.acquired_date) AS last_acquired_date,
            ipl.currency
           FROM (((public.investor_position_lot ipl
             JOIN public.investor_party ip ON ((ip.id = ipl.party_id)))
             JOIN public.investor_security isec_1 ON ((isec_1.id = ipl.security_id)))
             JOIN public.module_entities me ON ((me.id = isec_1.entity_id)))
          GROUP BY ipl.party_id, ip.organization_id, ip.name, isec_1.entity_id, me.name, isec_1.security_type, isec_1.series_name, ipl.currency
        ), entity_totals AS (
         SELECT position_totals.entity_id,
            sum(position_totals.total_units) AS fully_diluted_total
           FROM position_totals
          GROUP BY position_totals.entity_id
        ), latest_terms AS (
         SELECT DISTINCT ON (investor_security_terms_version.security_id) investor_security_terms_version.security_id,
            investor_security_terms_version.original_issue_price
           FROM public.investor_security_terms_version
          ORDER BY investor_security_terms_version.security_id, investor_security_terms_version.effective_date DESC NULLS LAST, investor_security_terms_version.created_at DESC
        ), latest_closing AS (
         SELECT DISTINCT ON (ife.entity_id) ife.entity_id,
            ic.post_money_valuation,
            ic.close_date AS last_transaction_date
           FROM (public.investor_closing ic
             JOIN public.investor_financing_event ife ON ((ife.id = ic.event_id)))
          ORDER BY ife.entity_id, ic.close_date DESC NULLS LAST, ic.created_at DESC
        )
 SELECT pt.party_id,
    pt.organization_id,
    pt.party_name,
    pt.entity_id,
    pt.entity_name,
    pt.security_type,
    pt.series_name,
    pt.total_units,
    pt.aggregate_cost,
    pt.first_acquired_date,
    pt.last_acquired_date,
    pt.currency,
    et.fully_diluted_total,
        CASE
            WHEN (et.fully_diluted_total > (0)::numeric) THEN ((pt.total_units / et.fully_diluted_total) * (100)::numeric)
            ELSE (0)::numeric
        END AS fully_diluted_percent,
    lt.original_issue_price AS current_price_per_unit,
    (pt.total_units * COALESCE(lt.original_issue_price, (0)::numeric)) AS implied_value,
        CASE
            WHEN (pt.aggregate_cost > (0)::numeric) THEN ((pt.total_units * COALESCE(lt.original_issue_price, (0)::numeric)) / pt.aggregate_cost)
            ELSE (0)::numeric
        END AS multiple,
    lc.post_money_valuation,
    lc.last_transaction_date
   FROM ((((position_totals pt
     LEFT JOIN entity_totals et ON ((et.entity_id = pt.entity_id)))
     LEFT JOIN public.investor_security isec ON (((isec.entity_id = pt.entity_id) AND (isec.series_name = pt.series_name))))
     LEFT JOIN latest_terms lt ON ((lt.security_id = isec.id)))
     LEFT JOIN latest_closing lc ON ((lc.entity_id = pt.entity_id)));


CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

grant delete on table "public"."investor_convertible_instruments" to "postgres";

grant insert on table "public"."investor_convertible_instruments" to "postgres";

grant references on table "public"."investor_convertible_instruments" to "postgres";

grant select on table "public"."investor_convertible_instruments" to "postgres";

grant trigger on table "public"."investor_convertible_instruments" to "postgres";

grant truncate on table "public"."investor_convertible_instruments" to "postgres";

grant update on table "public"."investor_convertible_instruments" to "postgres";

grant delete on table "public"."investor_equity_plan" to "postgres";

grant insert on table "public"."investor_equity_plan" to "postgres";

grant references on table "public"."investor_equity_plan" to "postgres";

grant select on table "public"."investor_equity_plan" to "postgres";

grant trigger on table "public"."investor_equity_plan" to "postgres";

grant truncate on table "public"."investor_equity_plan" to "postgres";

grant update on table "public"."investor_equity_plan" to "postgres";

grant delete on table "public"."investor_equity_plan_version" to "postgres";

grant insert on table "public"."investor_equity_plan_version" to "postgres";

grant references on table "public"."investor_equity_plan_version" to "postgres";

grant select on table "public"."investor_equity_plan_version" to "postgres";

grant trigger on table "public"."investor_equity_plan_version" to "postgres";

grant truncate on table "public"."investor_equity_plan_version" to "postgres";

grant update on table "public"."investor_equity_plan_version" to "postgres";

grant delete on table "public"."investor_events" to "postgres";

grant insert on table "public"."investor_events" to "postgres";

grant references on table "public"."investor_events" to "postgres";

grant select on table "public"."investor_events" to "postgres";

grant trigger on table "public"."investor_events" to "postgres";

grant truncate on table "public"."investor_events" to "postgres";

grant update on table "public"."investor_events" to "postgres";

grant delete on table "public"."investor_instrument_types" to "postgres";

grant insert on table "public"."investor_instrument_types" to "postgres";

grant references on table "public"."investor_instrument_types" to "postgres";

grant select on table "public"."investor_instrument_types" to "postgres";

grant trigger on table "public"."investor_instrument_types" to "postgres";

grant truncate on table "public"."investor_instrument_types" to "postgres";

grant update on table "public"."investor_instrument_types" to "postgres";

grant delete on table "public"."investor_seat_types" to "postgres";

grant insert on table "public"."investor_seat_types" to "postgres";

grant references on table "public"."investor_seat_types" to "postgres";

grant select on table "public"."investor_seat_types" to "postgres";

grant trigger on table "public"."investor_seat_types" to "postgres";

grant truncate on table "public"."investor_seat_types" to "postgres";

grant update on table "public"."investor_seat_types" to "postgres";

grant delete on table "public"."investor_stages" to "postgres";

grant insert on table "public"."investor_stages" to "postgres";

grant references on table "public"."investor_stages" to "postgres";

grant select on table "public"."investor_stages" to "postgres";

grant trigger on table "public"."investor_stages" to "postgres";

grant truncate on table "public"."investor_stages" to "postgres";

grant update on table "public"."investor_stages" to "postgres";

grant delete on table "public"."investor_transaction_types" to "postgres";

grant insert on table "public"."investor_transaction_types" to "postgres";

grant references on table "public"."investor_transaction_types" to "postgres";

grant select on table "public"."investor_transaction_types" to "postgres";

grant trigger on table "public"."investor_transaction_types" to "postgres";

grant truncate on table "public"."investor_transaction_types" to "postgres";

grant update on table "public"."investor_transaction_types" to "postgres";


