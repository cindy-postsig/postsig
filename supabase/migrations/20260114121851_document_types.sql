UPDATE public.document_types
SET code = 'safe', name = 'SAFE'
WHERE id = 5;

INSERT INTO public.document_types (id, module_id, code, name)
VALUES (10, 2, 'cpn', 'Convertible Promissory Note');