-- Add RLS policy for master_field_definitions
-- Required for FK joins from document_field_values to work

-- Allow all authenticated users to read field definitions
CREATE POLICY "master_field_definitions_select" ON public.master_field_definitions
    FOR SELECT
    TO authenticated
    USING (true);

-- Deny anonymous access
CREATE POLICY "master_field_definitions_anon_deny" ON public.master_field_definitions
    FOR ALL
    TO anon
    USING (false);
