alter table "public"."inv_companies" drop constraint "inv_companies_status_check";

alter table "public"."inv_transaction" drop constraint "inv_transaction_type_ck";

alter table "public"."inv_companies" add constraint "inv_companies_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'merged'::text, 'acquired'::text, 'dissolved'::text, 'exited'::text]))) not valid;

alter table "public"."inv_companies" validate constraint "inv_companies_status_check";

alter table "public"."inv_transaction" add constraint "inv_transaction_type_ck" CHECK ((transaction_type = ANY (ARRAY['purchase'::text, 'sale'::text, 'conversion'::text, 'exercise'::text, 'distribution'::text, 'transfer_in'::text, 'transfer_out'::text, 'write_off'::text, 'exit_consideration'::text, 'reclassification'::text, 'secondary_sale'::text, 'secondary_purchase'::text]))) not valid;

alter table "public"."inv_transaction" validate constraint "inv_transaction_type_ck";

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
    COALESCE((- sum(t.amount) FILTER (WHERE (t.transaction_type = ANY (ARRAY['purchase'::text, 'exercise'::text, 'secondary_purchase'::text])))), (0)::numeric) AS total_cost,
        CASE
            WHEN (sum(t.units) > (0)::numeric) THEN (sum(
            CASE
                WHEN (t.amount > (0)::numeric) THEN t.amount
                ELSE (0)::numeric
            END) / sum(t.units))
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
  GROUP BY t.organization_id, t.fund_id, f.name, t.company_id, ic.company_id, ic.name_override, gc.name, gc.domain, ic.status, t.security_id, s.name, s.security_type, t.currency
 HAVING (sum(t.units) > (0)::numeric);


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
    cs.our_ownership_percent AS ownership_pct,
    cs.fully_diluted_total,
    cs.implied_valuation AS post_money_valuation,
    (cs.share_price * (cs.our_total_shares)::numeric) AS my_fmv,
    pos.total_cost AS aggregate_cost,
        CASE
            WHEN (pos.total_cost > (0)::numeric) THEN ((cs.share_price * (cs.our_total_shares)::numeric) / pos.total_cost)
            ELSE NULL::numeric
        END AS multiple,
    rounds.total_equity_financing,
    pos.last_transaction AS last_transaction_date,
    entry_tx.entry_date,
    entry_tx.entry_amount,
    entry_tx.entry_stage_code,
    entry_tx.entry_stage_display_name,
    company_funds.fund_ids,
    company_funds.fund_names,
    company_funds.fund_short_names,
    company_funds.primary_fund_short_name,
    company_funds.primary_fund_name
   FROM ((((((public.inv_company ic
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
            inv_cap_table_snapshot.updated_at
           FROM public.inv_cap_table_snapshot
          WHERE (inv_cap_table_snapshot.company_id = ic.id)
          ORDER BY inv_cap_table_snapshot.snapshot_date DESC
         LIMIT 1) cs ON (true))
     LEFT JOIN LATERAL ( SELECT t.transaction_date AS entry_date,
            t.amount AS entry_amount,
            s.code AS entry_stage_code,
            s.display_name AS entry_stage_display_name
           FROM ((public.inv_transaction t
             LEFT JOIN public.inv_financing_round fr ON ((fr.id = t.financing_round_id)))
             LEFT JOIN public.inv_stages s ON ((s.id = fr.stage_id)))
          WHERE ((t.company_id = ic.id) AND (t.transaction_type = 'purchase'::text))
          ORDER BY t.transaction_date
         LIMIT 1) entry_tx ON (true))
     LEFT JOIN LATERAL ( WITH fund_ids AS (
                 SELECT DISTINCT f_1.id
                   FROM (public.inv_transaction t
                     JOIN public.inv_fund f_1 ON ((f_1.id = t.fund_id)))
                  WHERE (t.company_id = ic.id)
                  ORDER BY f_1.id
                ), numbered AS (
                 SELECT fi.id,
                    row_number() OVER () AS rn
                   FROM fund_ids fi
                )
         SELECT array_agg(numbered.id ORDER BY numbered.rn) AS fund_ids,
            array_agg(f.name ORDER BY numbered.rn) AS fund_names,
            array_agg(COALESCE(f.short_name, f.name) ORDER BY numbered.rn) AS fund_short_names,
            ( SELECT COALESCE(f2.short_name, f2.name) AS "coalesce"
                   FROM (public.inv_fund f2
                     JOIN public.inv_transaction t2 ON ((t2.fund_id = f2.id)))
                  WHERE ((t2.company_id = ic.id) AND (t2.transaction_type = 'purchase'::text))
                  ORDER BY t2.transaction_date
                 LIMIT 1) AS primary_fund_short_name,
            ( SELECT f2.name
                   FROM (public.inv_fund f2
                     JOIN public.inv_transaction t2 ON ((t2.fund_id = f2.id)))
                  WHERE ((t2.company_id = ic.id) AND (t2.transaction_type = 'purchase'::text))
                  ORDER BY t2.transaction_date
                 LIMIT 1) AS primary_fund_name
           FROM (numbered
             JOIN public.inv_fund f ON ((f.id = numbered.id)))) company_funds ON (true))
     LEFT JOIN ( SELECT v_inv_position.company_id,
            sum(v_inv_position.total_cost) AS total_cost,
            max(v_inv_position.last_transaction) AS last_transaction
           FROM public.v_inv_position
          GROUP BY v_inv_position.company_id) pos ON ((pos.company_id = ic.id)))
     LEFT JOIN ( SELECT fr.company_id,
            COALESCE((- sum(t.amount) FILTER (WHERE (t.transaction_type = 'purchase'::text))), (0)::numeric) AS total_equity_financing
           FROM (public.inv_financing_round fr
             LEFT JOIN public.inv_transaction t ON ((t.financing_round_id = fr.id)))
          GROUP BY fr.company_id) rounds ON ((rounds.company_id = ic.id)));


