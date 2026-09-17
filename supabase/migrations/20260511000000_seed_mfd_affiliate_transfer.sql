-- Seed master_field_definitions and document_type_fields for the
-- affiliate_transfer document type (id = 40, module_id = 2).
--
-- Fields seeded: at_transfer_details (json/single_object)
--   • source_fund      — fund transferring the position
--   • destination_fund — fund receiving the position
--   • instrument       — share class / stage being transferred
--   • quantity         — number of shares or units
--   • transfer_date    — effective date of transfer (ISO 8601)

-- Step 1: Upsert the master_field_definitions record
INSERT INTO public.master_field_definitions (
    field_key,
    default_label,
    default_data_type,
    default_tooltip_text,
    category,
    required,
    settings
)
VALUES (
    'at_transfer_details',
    'Transfer Details',
    'json',
    'Source fund, destination fund, instrument (stage), quantity of shares/units, and effective transfer date for the affiliate transfer.',
    'financials',
    false,
    jsonb_build_object(
        'renderType', 'single_object',
        'itemName',   'Transfer Details',
        'schema', jsonb_build_object(
            'source_fund',      jsonb_build_object(
                'type',        'text',
                'label',       'Source Fund',
                'required',    false,
                'tmp_ai_desc', 'Full legal name of the fund transferring the position'
            ),
            'destination_fund', jsonb_build_object(
                'type',        'text',
                'label',       'Destination Fund',
                'required',    false,
                'tmp_ai_desc', 'Full legal name of the fund receiving the transferred position'
            ),
            'instrument',       jsonb_build_object(
                'type',        'text',
                'label',       'Instrument',
                'required',    false,
                'tmp_ai_desc', 'Instrument or stage being transferred (e.g., "Series A Preferred", "Common Stock", "SAFE")'
            ),
            'quantity',         jsonb_build_object(
                'type',        'number',
                'label',       'Quantity',
                'required',    false,
                'tmp_ai_desc', 'Number of shares or units being transferred'
            ),
            'transfer_date',    jsonb_build_object(
                'type',        'date',
                'label',       'Transfer Date',
                'required',    false,
                'tmp_ai_desc', 'Effective date of the transfer (ISO 8601 format, e.g., 2024-03-15)'
            )
        )
    )
)
ON CONFLICT ON CONSTRAINT master_field_definitions_field_key_key DO UPDATE SET
    default_label        = EXCLUDED.default_label,
    default_tooltip_text = EXCLUDED.default_tooltip_text,
    category             = EXCLUDED.category,
    required             = EXCLUDED.required,
    settings             = EXCLUDED.settings,
    updated_at           = now();

-- Step 2: Link the MFD to the affiliate_transfer document type (id = 40)
INSERT INTO public.document_type_fields (document_type_id, master_field_definition_id)
SELECT
    40,
    mfd.id
FROM public.master_field_definitions mfd
WHERE mfd.field_key = 'at_transfer_details'
ON CONFLICT ON CONSTRAINT document_type_fields_document_type_id_master_field_definition_id_key DO NOTHING;
