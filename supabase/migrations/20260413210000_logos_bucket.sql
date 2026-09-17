INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT
  'logos',
  'logos',
  true,
  5242880,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml'
  ]
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'logos');

CREATE POLICY "logos_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.user_roles2 ur
    WHERE ur.user_id = auth.uid() AND ur.role_id = 12
  )
);

CREATE POLICY "logos_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.user_roles2 ur
    WHERE ur.user_id = auth.uid() AND ur.role_id = 12
  )
)
WITH CHECK (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.user_roles2 ur
    WHERE ur.user_id = auth.uid() AND ur.role_id = 12
  )
);

CREATE POLICY "logos_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.user_roles2 ur
    WHERE ur.user_id = auth.uid() AND ur.role_id = 12
  )
);

CREATE POLICY "logos_anon_deny_write"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "logos_anon_deny_update"
ON storage.objects FOR UPDATE
TO anon
USING (false);

CREATE POLICY "logos_anon_deny_delete"
ON storage.objects FOR DELETE
TO anon
USING (false);
