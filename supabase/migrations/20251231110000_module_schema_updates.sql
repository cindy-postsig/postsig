-- Make document_type_id nullable to support pending documents
-- that haven't been processed by AI yet

ALTER TABLE public.module_documents
  ALTER COLUMN document_type_id DROP NOT NULL;

-- Remove deprecated name column from module_entities
ALTER TABLE public.module_entities
  DROP COLUMN IF EXISTS name;
