drop view if exists "public"."investor_party_summary";

alter table "public"."investor_equity_plan" disable row level security;

alter table "public"."investor_equity_plan_version" disable row level security;

alter table "public"."investor_instrument_types" disable row level security;

alter table "public"."investor_seat_types" disable row level security;

alter table "public"."investor_security_terms_version" add column "outstanding_shares" numeric;

alter table "public"."investor_transaction_types" disable row level security;

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
            array_agg(DISTINCT ife.round_name) FILTER (WHERE (ife.round_name IS NOT NULL)) AS rounds
           FROM ((((public.investor_closing_participant icp
             JOIN public.investor_party ip ON ((ip.id = icp.party_id)))
             JOIN public.investor_closing ic ON ((ic.id = icp.closing_id)))
             JOIN public.investor_financing_event ife ON ((ife.id = ic.event_id)))
             JOIN public.module_entities me ON ((me.id = ife.entity_id)))
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

grant delete on table "public"."investor_transaction_types" to "postgres";

grant insert on table "public"."investor_transaction_types" to "postgres";

grant references on table "public"."investor_transaction_types" to "postgres";

grant select on table "public"."investor_transaction_types" to "postgres";

grant trigger on table "public"."investor_transaction_types" to "postgres";

grant truncate on table "public"."investor_transaction_types" to "postgres";

grant update on table "public"."investor_transaction_types" to "postgres";


