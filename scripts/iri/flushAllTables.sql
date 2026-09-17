BEGIN;

DELETE from public.module_document_files;
DELETE from public.module_documents;
DELETE FROM public.inv_board_seat;
DELETE FROM public.inv_cap_table_snapshot;
DELETE FROM public.inv_co_investor;
DELETE FROM public.inv_transaction;
DELETE FROM public.inv_security_terms;
DELETE FROM public.inv_security;
DELETE FROM public.inv_round_terms;
DELETE FROM public.inv_information_rights;
DELETE FROM public.inv_fund;
DELETE FROM public.inv_financing_round;
DELETE FROM public.inv_equity_plan_snapshot;
DELETE FROM public.inv_equity_plan;
DELETE FROM public.inv_company;
DELETE FROM public.inv_companies;
DELETE FROM public.module_documents;

-- Reset sequences (example names; verify in your DB and adjust)
SELECT pg_catalog.setval(pg_get_serial_sequence('public.inv_board_seat','id'), 1, false);
SELECT pg_catalog.setval(pg_get_serial_sequence('public.inv_cap_table_snapshot','id'), 1, false);
SELECT pg_catalog.setval(pg_get_serial_sequence('public.inv_co_investor','id'), 1, false);
SELECT pg_catalog.setval(pg_get_serial_sequence('public.inv_transaction','id'), 1, false);
SELECT pg_catalog.setval(pg_get_serial_sequence('public.inv_security_terms','id'), 1, false);
SELECT pg_catalog.setval(pg_get_serial_sequence('public.inv_security','id'), 1, false);
SELECT pg_catalog.setval(pg_get_serial_sequence('public.inv_round_terms','id'), 1, false);
SELECT pg_catalog.setval(pg_get_serial_sequence('public.inv_information_rights','id'), 1, false);
SELECT pg_catalog.setval(pg_get_serial_sequence('public.inv_fund','id'), 1, false);
SELECT pg_catalog.setval(pg_get_serial_sequence('public.inv_financing_round','id'), 1, false);
SELECT pg_catalog.setval(pg_get_serial_sequence('public.inv_equity_plan_snapshot','id'), 1, false);
SELECT pg_catalog.setval(pg_get_serial_sequence('public.inv_equity_plan','id'), 1, false);
SELECT pg_catalog.setval(pg_get_serial_sequence('public.inv_company','id'), 1, false);
SELECT pg_catalog.setval(pg_get_serial_sequence('public.inv_companies','id'), 1, false);
SELECT pg_catalog.setval(pg_get_serial_sequence('public.module_documents','id'), 1, false);
COMMIT;