-- Remove the 'Rerunning' document status type (status_id 7)
-- This status is no longer needed; ai_extraction_status tracks the rerun lifecycle instead.

-- First move any documents still on status_id 7 back to 'Ready for extraction' (2)
UPDATE public.module_documents SET status_id = 2 WHERE status_id = 7;

-- Then remove the status type
DELETE FROM public.module_document_status_types WHERE id = 7;
