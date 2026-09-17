-- Remove test and logging tables that are no longer needed
DROP TABLE IF EXISTS public.test_table;
DROP TABLE IF EXISTS public.contract_update_log;
DROP TABLE IF EXISTS public.vendor_processing_log;
DROP TABLE IF EXISTS public.extraction_audit;

