INSERT INTO public.module_document_status_types (id, name, code, description)
VALUES (7, 'Rerunning', 'rerunning', 'Document is being re-extracted')
ON CONFLICT (code) DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('public.module_document_status_types', 'id'),
  (SELECT coalesce(max(id), 1) FROM public.module_document_status_types),
  true
);

ALTER TYPE public.ai_extraction_status ADD VALUE IF NOT EXISTS 'rerunning';
