-- Migration: Add field_definition_id to document_field_values
-- This links field values to their definitions in master_field_definitions

--------------------------------------------------------------------------------
-- 1. Add field_definition_id column
--------------------------------------------------------------------------------
ALTER TABLE public.document_field_values
ADD COLUMN IF NOT EXISTS field_definition_id UUID REFERENCES public.master_field_definitions(id);

--------------------------------------------------------------------------------
-- 2. Add unique constraint (one value per field per document)
--------------------------------------------------------------------------------
ALTER TABLE public.document_field_values
DROP CONSTRAINT IF EXISTS dfv_doc_field_def_unique;

ALTER TABLE public.document_field_values
ADD CONSTRAINT dfv_doc_field_def_unique UNIQUE (module_document_id, field_definition_id);

--------------------------------------------------------------------------------
-- 3. Add index for join queries
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dfv_field_definition
ON public.document_field_values(field_definition_id);

--------------------------------------------------------------------------------
-- 4. Add index for document lookups
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dfv_module_document
ON public.document_field_values(module_document_id);
