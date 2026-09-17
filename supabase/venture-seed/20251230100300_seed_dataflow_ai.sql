-- Migration: Seed DataFlow AI test data for venture module
-- This creates a complete portfolio company with all field values

--------------------------------------------------------------------------------
-- 1. Insert into companies table (global entity)
--------------------------------------------------------------------------------
INSERT INTO companies (name, domain, industry, headquarters, legal_jurisdiction, founded_year, status)
VALUES ('DataFlow AI', 'dataflow.ai', 'Artificial Intelligence', 'New York, United States', 'Delaware, United States', 2022, 'active')
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- 2. Insert into module_entities (org-scoped portfolio company)
--------------------------------------------------------------------------------
INSERT INTO module_entities (organization_id, module_id, company_id, entity_type, name, status, metadata)
SELECT
    (SELECT id FROM organizations LIMIT 1),
    2,  -- venture module
    (SELECT id FROM companies WHERE domain = 'dataflow.ai'),
    'portfolio_company',
    'DataFlow AI',
    'active',
    '{}'::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM module_entities WHERE name = 'DataFlow AI' AND entity_type = 'portfolio_company'
);

--------------------------------------------------------------------------------
-- 3. Create IRA document (contains legal terms)
--------------------------------------------------------------------------------
INSERT INTO module_documents (organization_id, user_id, module_id, document_type_id, entity_id, metadata, status)
SELECT
    (SELECT id FROM organizations LIMIT 1),
    (SELECT id FROM users LIMIT 1),
    2,
    (SELECT id FROM document_types WHERE module_id = 2 AND code = 'ira'),
    (SELECT id FROM module_entities WHERE name = 'DataFlow AI' AND entity_type = 'portfolio_company'),
    '{"source": "seed_data", "document_date": "2024-09-15"}'::jsonb,
    'processed'
WHERE NOT EXISTS (
    SELECT 1 FROM module_documents md
    JOIN module_entities me ON md.entity_id = me.id
    JOIN document_types dt ON md.document_type_id = dt.id
    WHERE me.name = 'DataFlow AI' AND dt.code = 'ira'
);

--------------------------------------------------------------------------------
-- 4. Create Charter document (contains cap table, entity info)
--------------------------------------------------------------------------------
INSERT INTO module_documents (organization_id, user_id, module_id, document_type_id, entity_id, metadata, status)
SELECT
    (SELECT id FROM organizations LIMIT 1),
    (SELECT id FROM users LIMIT 1),
    2,
    (SELECT id FROM document_types WHERE module_id = 2 AND code = 'charter'),
    (SELECT id FROM module_entities WHERE name = 'DataFlow AI' AND entity_type = 'portfolio_company'),
    '{"source": "seed_data", "document_date": "2022-03-01"}'::jsonb,
    'processed'
WHERE NOT EXISTS (
    SELECT 1 FROM module_documents md
    JOIN module_entities me ON md.entity_id = me.id
    JOIN document_types dt ON md.document_type_id = dt.id
    WHERE me.name = 'DataFlow AI' AND dt.code = 'charter'
);

--------------------------------------------------------------------------------
-- 5. Insert field values for IRA document
--------------------------------------------------------------------------------
-- Get IRA document ID and insert field values
DO $$
DECLARE
    ira_doc_id BIGINT;
    charter_doc_id BIGINT;
BEGIN
    -- Get document IDs
    SELECT md.id INTO ira_doc_id
    FROM module_documents md
    JOIN module_entities me ON md.entity_id = me.id
    JOIN document_types dt ON md.document_type_id = dt.id
    WHERE me.name = 'DataFlow AI' AND dt.code = 'ira';

    SELECT md.id INTO charter_doc_id
    FROM module_documents md
    JOIN module_entities me ON md.entity_id = me.id
    JOIN document_types dt ON md.document_type_id = dt.id
    WHERE me.name = 'DataFlow AI' AND dt.code = 'charter';

    -- Skip if documents don't exist
    IF ira_doc_id IS NULL OR charter_doc_id IS NULL THEN
        RAISE NOTICE 'Documents not found, skipping field value inserts';
        RETURN;
    END IF;

    -- Insert IRA document field values (legal terms, ownership, etc.)
    INSERT INTO document_field_values (module_document_id, field_definition_id, value_text)
    SELECT ira_doc_id, id, 'Series A' FROM master_field_definitions WHERE field_key = 'stage'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_text)
    SELECT ira_doc_id, id, 'Active' FROM master_field_definitions WHERE field_key = 'investment_status'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_number)
    SELECT ira_doc_id, id, 45000000 FROM master_field_definitions WHERE field_key = 'valuation'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_number)
    SELECT ira_doc_id, id, 45000000 FROM master_field_definitions WHERE field_key = 'post_money_valuation'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_number)
    SELECT ira_doc_id, id, 4500000 FROM master_field_definitions WHERE field_key = 'my_total_fmv'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_number)
    SELECT ira_doc_id, id, 10.0 FROM master_field_definitions WHERE field_key = 'my_ownership'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_number)
    SELECT ira_doc_id, id, 10.0 FROM master_field_definitions WHERE field_key = 'my_fully_diluted_percent'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_text)
    SELECT ira_doc_id, id, 'Differential Ventures Fund III, L.P.' FROM master_field_definitions WHERE field_key = 'fund'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_text)
    SELECT ira_doc_id, id, '12+ months' FROM master_field_definitions WHERE field_key = 'cash_position'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_boolean)
    SELECT ira_doc_id, id, false FROM master_field_definitions WHERE field_key = 'currently_raising'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_date)
    SELECT ira_doc_id, id, '2025-02-20' FROM master_field_definitions WHERE field_key = 'next_board_meeting'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_text)
    SELECT ira_doc_id, id, 'Corporation' FROM master_field_definitions WHERE field_key = 'entity_type'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_number)
    SELECT ira_doc_id, id, 12000000 FROM master_field_definitions WHERE field_key = 'total_equity_financing'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_number)
    SELECT ira_doc_id, id, 2.15 FROM master_field_definitions WHERE field_key = 'current_price_per_unit'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_date)
    SELECT ira_doc_id, id, '2024-09-15' FROM master_field_definitions WHERE field_key = 'last_transaction_date'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    -- Entry transaction fields
    INSERT INTO document_field_values (module_document_id, field_definition_id, value_date)
    SELECT ira_doc_id, id, '2023-03-15' FROM master_field_definitions WHERE field_key = 'my_entry_date'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_text)
    SELECT ira_doc_id, id, 'Seed' FROM master_field_definitions WHERE field_key = 'stage_at_entry'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_number)
    SELECT ira_doc_id, id, 500000 FROM master_field_definitions WHERE field_key = 'my_entry_cost'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_number)
    SELECT ira_doc_id, id, 8000000 FROM master_field_definitions WHERE field_key = 'post_money_at_entry'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_number)
    SELECT ira_doc_id, id, 2000000 FROM master_field_definitions WHERE field_key = 'my_aggregate_cost'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_number)
    SELECT ira_doc_id, id, 4500000 FROM master_field_definitions WHERE field_key = 'implied_value'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_number)
    SELECT ira_doc_id, id, 2.25 FROM master_field_definitions WHERE field_key = 'multiple'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    -- Board members (JSON)
    INSERT INTO document_field_values (module_document_id, field_definition_id, value_json)
    SELECT ira_doc_id, id, '[{"name": "Sarah Chen", "role": "CEO"}, {"name": "Mark Wilson", "isLead": true, "fund": "Differential Ventures Fund III, L.P."}, {"name": "Jane Doe"}]'::jsonb
    FROM master_field_definitions WHERE field_key = 'board_of_directors'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    INSERT INTO document_field_values (module_document_id, field_definition_id, value_json)
    SELECT ira_doc_id, id, '[{"name": "Observer", "fund": "Innovation Partners"}]'::jsonb
    FROM master_field_definitions WHERE field_key = 'board_observers'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    -- Tags
    INSERT INTO document_field_values (module_document_id, field_definition_id, value_json)
    SELECT ira_doc_id, id, '[{"id": "3", "name": "AI/ML"}, {"id": "2", "name": "B2B"}]'::jsonb
    FROM master_field_definitions WHERE field_key = 'tags'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    -- Transactions
    INSERT INTO document_field_values (module_document_id, field_definition_id, value_json)
    SELECT ira_doc_id, id, '[{"date": "2023-03-15", "amount": 500000, "type": "Seed"}, {"date": "2025-02-15", "amount": 1500000, "type": "Series A"}]'::jsonb
    FROM master_field_definitions WHERE field_key = 'transactions'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    -- Legal terms (complete JSON object)
    INSERT INTO document_field_values (module_document_id, field_definition_id, value_json)
    SELECT ira_doc_id, id, '{
        "headerStatus": {"majorInvestorStatus": true, "informationRights": true},
        "informationRights": {
            "budgetAndBusinessPlan": {"monthly": false, "quarterly": false, "yearEnd": true},
            "capitalizationTable": {"monthly": false, "quarterly": true, "yearEnd": false},
            "balanceSheet": {"monthly": true, "quarterly": true, "yearEnd": false},
            "incomeAndCashFlows": {"monthly": true, "quarterly": true, "yearEnd": false},
            "auditedBalanceSheet": {"monthly": false, "quarterly": false, "yearEnd": true},
            "auditedFinancialStatements": {"monthly": false, "quarterly": false, "yearEnd": true},
            "auditedIncomeAndCashFlows": {"monthly": false, "quarterly": false, "yearEnd": true},
            "auditedStockholdersEquity": {"monthly": false, "quarterly": false, "yearEnd": true}
        },
        "majorInvestor": {
            "thresholdAmount": null,
            "thresholdOwnershipPercent": null,
            "thresholdShares": 2500000,
            "majorInvestorsByThreshold": ["Differential Ventures Fund III, L.P."],
            "namedMajorInvestor": ["Differential Ventures Fund III, L.P."]
        },
        "economicRights": {
            "antiDilutionRights": "Broad Based",
            "liquidationPreferenceSeniority": ["Series Seed", "Series A"],
            "milestoneClosings": false
        },
        "qsbs": {
            "qualifiedSmallBusinessStockCovenantGiven": true,
            "qualifiedSmallBusinessRepMade": true
        },
        "dividends": {
            "accruingDividends": null,
            "cumulativeDividends": null,
            "dividendRate": null,
            "dividendSeniority": null
        },
        "otherLegalTerms": {
            "proRataRightsForAll": false,
            "proRataRightsForMajorInvestors": true,
            "dragAlong": true,
            "payToPlay": false,
            "dAndOInsurance": true,
            "investorCounselFeeCap": 35000,
            "employeeVestingProtocol": true,
            "investorsSubjectToROFR": false,
            "requiredClosingPayments": false,
            "rofrAndCosaleAgreement": true,
            "subsequentClosingWindowDays": 90,
            "standardProRataFormulation": true,
            "issuerPaysInvestorCounselFees": true,
            "founderVestingProtocol": false,
            "registrationRightsForPreferredInvestors": true
        }
    }'::jsonb
    FROM master_field_definitions WHERE field_key = 'legal_terms'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

    -- Cap table (from Charter document)
    INSERT INTO document_field_values (module_document_id, field_definition_id, value_json)
    SELECT charter_doc_id, id, '{
        "availableDates": ["2024-12-31", "2024-09-30"],
        "snapshots": [
            {
                "asOfDate": "2024-12-31",
                "securities": [
                    {"id": "common-stock", "name": "Common Stock", "units": 15000000, "fdPercent": 33.33, "myUnits": 0, "myFdPercent": 0},
                    {"id": "common", "name": "Common", "parentId": "common-stock", "units": 15000000, "fdPercent": 33.33, "myUnits": 0, "myFdPercent": 0},
                    {"id": "preferred-stock", "name": "Preferred Stock", "units": 25000000, "fdPercent": 55.56, "myUnits": 4500000, "myFdPercent": 10.0},
                    {"id": "series-seed", "name": "Series Seed", "parentId": "preferred-stock", "units": 10000000, "fdPercent": 22.22, "myUnits": 2250000, "myFdPercent": 5.0},
                    {"id": "series-a", "name": "Series A", "parentId": "preferred-stock", "units": 15000000, "fdPercent": 33.33, "myUnits": 2250000, "myFdPercent": 5.0},
                    {"id": "options-warrants", "name": "Options & Warrants", "units": 5000000, "fdPercent": 11.11, "myUnits": 0, "myFdPercent": 0},
                    {"id": "employee-options", "name": "Employee Options", "parentId": "options-warrants", "units": 4500000, "fdPercent": 10.0, "myUnits": 0, "myFdPercent": 0},
                    {"id": "advisor-warrants", "name": "Advisor Warrants", "parentId": "options-warrants", "units": 500000, "fdPercent": 1.11, "myUnits": 0, "myFdPercent": 0}
                ]
            },
            {
                "asOfDate": "2024-09-30",
                "securities": [
                    {"id": "common-stock", "name": "Common Stock", "units": 15000000, "fdPercent": 37.5, "myUnits": 0, "myFdPercent": 0},
                    {"id": "common", "name": "Common", "parentId": "common-stock", "units": 15000000, "fdPercent": 37.5, "myUnits": 0, "myFdPercent": 0},
                    {"id": "preferred-stock", "name": "Preferred Stock", "units": 21000000, "fdPercent": 52.5, "myUnits": 4000000, "myFdPercent": 10.0},
                    {"id": "series-seed", "name": "Series Seed", "parentId": "preferred-stock", "units": 10000000, "fdPercent": 25.0, "myUnits": 2250000, "myFdPercent": 5.625},
                    {"id": "series-a", "name": "Series A", "parentId": "preferred-stock", "units": 11000000, "fdPercent": 27.5, "myUnits": 1750000, "myFdPercent": 4.375},
                    {"id": "options-warrants", "name": "Options & Warrants", "units": 4000000, "fdPercent": 10.0, "myUnits": 0, "myFdPercent": 0},
                    {"id": "employee-options", "name": "Employee Options", "parentId": "options-warrants", "units": 3600000, "fdPercent": 9.0, "myUnits": 0, "myFdPercent": 0},
                    {"id": "advisor-warrants", "name": "Advisor Warrants", "parentId": "options-warrants", "units": 400000, "fdPercent": 1.0, "myUnits": 0, "myFdPercent": 0}
                ]
            }
        ]
    }'::jsonb
    FROM master_field_definitions WHERE field_key = 'cap_table'
    ON CONFLICT (module_document_id, field_definition_id) DO NOTHING;

END $$;
