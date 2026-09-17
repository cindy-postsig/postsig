-- Create storage bucket for multi-module documents
-- Path structure: {organization_id}/{module_code}/{document_public_id}/{file_role}/{filename}

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  52428800, -- 50MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/plain',
    'text/markdown',
    'text/csv'
  ]
);

-- RLS Policies for documents bucket
-- Note: storage.foldername(name) returns array of path segments
-- Path: {org_id}/{module_code}/{doc_public_id}/{file_role}/{filename}
-- So foldername(name)[1] = organization_id

-- SELECT: Users can read files in their organization
CREATE POLICY "documents_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.users WHERE id = auth.uid()
  )
);

-- INSERT: Users can upload files to their organization
CREATE POLICY "documents_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.users WHERE id = auth.uid()
  )
);

-- UPDATE: Users can update files in their organization
CREATE POLICY "documents_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.users WHERE id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.users WHERE id = auth.uid()
  )
);

-- DELETE: Only admins can delete files (role_id = 12)
CREATE POLICY "documents_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.users WHERE id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.user_roles2 ur
    WHERE ur.user_id = auth.uid() AND ur.role_id = 12
  )
);

-- SELECT: Extraction service accounts can read all documents
CREATE POLICY "documents_extractor_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (auth.jwt() ->> 'email') IN (
    'extraction@postsig.com',
    'ext_1@postsig.com'
  )
);

-- Deny anonymous access to documents bucket
CREATE POLICY "documents_anon_deny"
ON storage.objects FOR ALL
TO anon
USING (
  bucket_id != 'documents'
);
