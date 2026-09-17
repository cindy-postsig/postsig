-- Migration script to drop the global ict_provider column from the public.vendors table

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_schema = 'public' 
               AND table_name = 'vendors' 
               AND column_name = 'ict_provider') THEN
        RAISE NOTICE 'Column public.vendors.ict_provider exists, dropping it.';
        ALTER TABLE public.vendors DROP COLUMN ict_provider;
    ELSE
        RAISE NOTICE 'Column public.vendors.ict_provider does not exist, no action taken.';
    END IF;
END$$;

COMMIT; 