-- TRIGGERS

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
            'inv_equity_plan', 'inv_equity_plan_snapshot'
        ])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%I_updated_at ON %I;
            CREATE TRIGGER update_%I_updated_at
                BEFORE UPDATE ON %I
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        ', tbl, tbl, tbl, tbl);
    END LOOP;
END $$;

-- Org consistency trigger
CREATE OR REPLACE FUNCTION check_portfolio_org_consistency()
RETURNS TRIGGER AS $$
DECLARE
    parent_org_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'inv_security' THEN
        SELECT organization_id INTO parent_org_id FROM inv_company WHERE id = NEW.company_id;
        IF parent_org_id != NEW.organization_id THEN
            RAISE EXCEPTION 'Security organization_id must match company';
        END IF;
    ELSIF TG_TABLE_NAME = 'inv_transaction' THEN
        SELECT organization_id INTO parent_org_id FROM inv_fund WHERE id = NEW.fund_id;
        IF parent_org_id != NEW.organization_id THEN
            RAISE EXCEPTION 'Transaction organization_id must match fund';
        END IF;
        SELECT organization_id INTO parent_org_id FROM inv_company WHERE id = NEW.company_id;
        IF parent_org_id != NEW.organization_id THEN
            RAISE EXCEPTION 'Transaction organization_id must match company';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_inv_security_org
    BEFORE INSERT OR UPDATE ON inv_security
    FOR EACH ROW EXECUTE FUNCTION check_portfolio_org_consistency();

CREATE TRIGGER check_inv_transaction_org
    BEFORE INSERT OR UPDATE ON inv_transaction
    FOR EACH ROW EXECUTE FUNCTION check_portfolio_org_consistency();
