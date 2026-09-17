-- =============================================================================
-- Add 3 universal investor basics fields to all document types
-- These fields apply across every document type to capture company identity,
-- fund identity, and the full set of investing fund entities.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PART 1: Insert master field definitions
-- ---------------------------------------------------------------------------
INSERT INTO "public"."master_field_definitions" (
    "field_key",
    "default_label",
    "default_data_type",
    "default_select_options",
    "default_ui_component_hint",
    "default_validation_rules",
    "default_tooltip_text",
    "category",
    "created_at",
    "updated_at",
    "settings"
) VALUES
    (
        'company_name',
        'Company Name',
        'text',
        null,
        null,
        null,
        'The legal name of the issuing company as it appears on the title page or preamble. Excludes template placeholders.',
        'core',
        now(),
        now(),
        null
    ),
    (
        'fund_name',
        'Fund Name',
        'text',
        null,
        null,
        null,
        'Full legal name of the investing fund (e.g. Acme Ventures Fund III, L.P.). Null if no fund name is identifiable.',
        'core',
        now(),
        now(),
        null
    ),
    (
        'investor_extraction_fund_describe',
        'Investing Fund Entities',
        'json',
        null,
        null,
        null,
        'All fund/LP/institutional entities that are purchasing shares or investing — extracted from introductory paragraphs, Purchaser/Investor headings, Exhibits/Annexes, and signature blocks.',
        'core',
        now(),
        now(),
        '{"schema":{"fund_entity":{"type":"text","label":"Fund Entity Name","required":true}},"itemName":"Fund Entity","renderType":"array_string"}'
    )
ON CONFLICT ("field_key") DO NOTHING;


-- ---------------------------------------------------------------------------
-- PART 2: Link all 3 fields to every document type (IDs 1–39)
-- Uses a cross-join so adding a single field here fans out to all types.
-- ---------------------------------------------------------------------------
WITH
field_keys (k) AS (
    VALUES
        ('company_name'),
        ('fund_name'),
        ('investor_extraction_fund_describe')
),
doc_type_ids (dt_id) AS (
    VALUES
        (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),
        (11),(12),(13),(14),(15),(16),(17),(18),(19),(20),
        (21),(22),(23),(24),(25),(26),(27),(28),(29),(30),
        (31),(32),(33),(34),(35),(36),(37),(38),(39)
),
resolved AS (
    SELECT
        d.dt_id                  AS document_type_id,
        m.id                     AS master_field_definition_id
    FROM field_keys f
    INNER JOIN public.master_field_definitions m ON m.field_key = f.k
    CROSS JOIN doc_type_ids d
)
INSERT INTO public.document_type_fields (
    id,
    document_type_id,
    master_field_definition_id,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid()::uuid,
    r.document_type_id,
    r.master_field_definition_id,
    now()::timestamptz,
    now()::timestamptz
FROM resolved r
ON CONFLICT (document_type_id, master_field_definition_id) DO NOTHING;
