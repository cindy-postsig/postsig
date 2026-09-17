-- Seed prompt_template_groups and prompt_templates for investor basics extraction
-- This includes the 3 core fields we want to extract for investors: portfolio company, document type, and fund 

-- Insert prompt_template_groups for the 3 investor basics fields
INSERT INTO "public"."prompt_template_groups" ("id", "group_key", "description", "module_id")
VALUES
  (
    'b97f59c3-7191-4128-bb93-18f144ec5776',
    'portfolio_company',
    'Extract the portfolio company name from investor documents',
    2
  ),
  (
    '964b7a9b-a2bc-4329-93eb-7809a16a80a9',
    'document_type',
    'Classify the investor document type',
    2
  ),
  (
    'dcbf9fc1-4875-4dba-a1ff-0f0dfc47cafe',
    'fund',
    'Extract the fund or investment vehicle name from investor documents',
    2
  )
ON CONFLICT (group_key) DO NOTHING;


-- Insert prompt_templates (active v1) for each group
INSERT INTO "public"."prompt_templates" ("id", "prompt_group_id", "template_content", "version", "prompt_key", "is_active")
VALUES
  (
    '55a84565-49dc-422d-b2cc-4726356f7fab',
    'b97f59c3-7191-4128-bb93-18f144ec5776',
    E'Please return the name of the company issuing the securities in this investment document.\n\nIMPORTANT: Look for the ACTUAL company name, not placeholder text like "[Insert Company Name]", "[COMPANY]", "________", or similar template placeholders.\n\nThe real company name is usually found in:\n- The document title or header\n- "The Company" definition section (e.g., "The Company: Acme Corp, Inc.")\n- Signature blocks\n- References to the issuing corporation\n\nReturn only the company name, not a sentence.',
    1,
    'v1',
    true
  ),
  (
    '293cb423-315f-43ce-a3db-12fc1cb9ff9d',
    '964b7a9b-a2bc-4329-93eb-7809a16a80a9',
    E'Please return only one option out of the following as the answer for the type of investment document.\n\nAnswer should only be the code before the colon. For example, return "spa" not "Stock Purchase Agreement".\n\nFollowing is the list of options:\n\n- **coi**: Certificate of Incorporation, Charter, or Amended Charter\n- **cpn**: Convertible Promissory Note\n- **safe**: SAFE (Simple Agreement for Future Equity)\n- **spa**: Stock Purchase Agreement or Series Preferred Stock Purchase Agreement\n- **ira**: Investor Rights Agreement\n- **voting**: Voting Agreement\n- **rofr_cosale**: Right of First Refusal and/or Co-Sale Agreement\n- **side_letter**: Side Letter\n- **amendment**: Amendment to any of the above documents\n- **warrant**: Warrant or Warrant Agreement\n\nIf the document type is not in the above list, return the closest match.',
    1,
    'v1',
    true
  ),
  (
    '0d2b1a94-6d79-4416-b57a-d25f2b99c893',
    'dcbf9fc1-4875-4dba-a1ff-0f0dfc47cafe',
    E'Identify the fund or investment vehicle making the investment.\n\nLook for limited partnership names like:\n- "[Name] Ventures Fund [I/II/III], L.P."\n- "[Name] Capital Partners [Year], L.P."\n- "[Name] Growth Fund, LLC"\n- "[Name] Opportunities Fund, LP"\n\nThe fund name is typically found in:\n- The investor/purchaser signature block\n- Schedule of Investors/Purchasers\n- "The Investors" or "The Purchasers" definition\n- Recitals section identifying the purchasing party\n\nIMPORTANT: Return the FULL legal name of the fund (e.g., "Acme Ventures Fund III, L.P."), not just "Fund III".\n\nReturn null if no fund name is identifiable.',
    1,
    'v1',
    true
  )
ON CONFLICT DO NOTHING;


-- Set active_version_id on each prompt_template_group
UPDATE "public"."prompt_template_groups"
SET "active_version_id" = '55a84565-49dc-422d-b2cc-4726356f7fab'
WHERE "id" = 'b97f59c3-7191-4128-bb93-18f144ec5776';

UPDATE "public"."prompt_template_groups"
SET "active_version_id" = '293cb423-315f-43ce-a3db-12fc1cb9ff9d'
WHERE "id" = '964b7a9b-a2bc-4329-93eb-7809a16a80a9';

UPDATE "public"."prompt_template_groups"
SET "active_version_id" = '0d2b1a94-6d79-4416-b57a-d25f2b99c893'
WHERE "id" = 'dcbf9fc1-4875-4dba-a1ff-0f0dfc47cafe';


-- Link existing fund MFD to its prompt_template_group and set is_array in settings
UPDATE "public"."master_field_definitions"
SET
  "prompt_template_group_id" = 'dcbf9fc1-4875-4dba-a1ff-0f0dfc47cafe',
  "settings" = COALESCE("settings", '{}'::jsonb) || '{"is_array": true}'::jsonb
WHERE "field_key" = 'fund' AND "prompt_template_group_id" IS NULL;


-- Insert MFD rows for portfolio_company and document_type
INSERT INTO "public"."master_field_definitions"
  ("id", "field_key", "default_label", "default_data_type", "category", "prompt_template_group_id", "settings")
VALUES
  (
    'd98c4d2c-5ae4-46a3-bcf4-30f7184e1c7a',
    'portfolio_company',
    'Portfolio Company',
    'text',
    'core',
    'b97f59c3-7191-4128-bb93-18f144ec5776',
    NULL
  ),
  (
    '79e4afbd-c8f1-43f6-9d92-64a9e33b2e71',
    'document_type',
    'Document Type',
    'select',
    'core',
    '964b7a9b-a2bc-4329-93eb-7809a16a80a9',
    '{"enum_values": ["coi", "cpn", "safe", "spa", "ira", "voting", "rofr_cosale", "side_letter", "amendment", "warrant"]}'
  )
ON CONFLICT (field_key) DO UPDATE SET
  "prompt_template_group_id" = EXCLUDED."prompt_template_group_id",
  "settings" = COALESCE(EXCLUDED."settings", "master_field_definitions"."settings");
