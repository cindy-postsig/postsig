-- ROW LEVEL SECURITY

ALTER TABLE inv_fund ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_company ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_security ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_security_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_financing_round ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_round_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_information_rights ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_cap_table_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_co_investor ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_board_seat ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_equity_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_equity_plan_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_fund_acl_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_fund_acl_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_company_acl_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_company_acl_group ENABLE ROW LEVEL SECURITY;

-- Helper function (in public schema - auth schema is restricted)
CREATE OR REPLACE FUNCTION public.user_organization_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
    SELECT organization_id FROM public.users WHERE id = auth.uid()
$$;

-- RLS Policies (org-scoped)
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'inv_fund', 'inv_company', 'inv_security',
            'inv_security_terms', 'inv_financing_round',
            'inv_round_terms', 'inv_information_rights',
            'inv_cap_table_snapshot', 'inv_transaction',
            'inv_co_investor', 'inv_board_seat',
            'inv_equity_plan', 'inv_equity_plan_snapshot',
            'inv_fund_acl_user', 'inv_fund_acl_group',
            'inv_company_acl_user', 'inv_company_acl_group'
        ])
    LOOP
        EXECUTE format('
            DROP POLICY IF EXISTS "org_access" ON %I;
            CREATE POLICY "org_access" ON %I FOR ALL
                USING (organization_id = public.user_organization_id())
                WITH CHECK (organization_id = public.user_organization_id());
        ', tbl, tbl);
    END LOOP;
END $$;
