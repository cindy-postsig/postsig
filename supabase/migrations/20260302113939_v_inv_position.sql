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
 HAVING (sum(t.units) >= (0)::numeric);
