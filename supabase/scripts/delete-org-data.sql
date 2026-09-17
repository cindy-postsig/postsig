BEGIN;

set local app.org_id = 'a364d2fa-91f4-47ff-afed-a89308d6d651';


DELETE FROM public.module_document_extractions
    WHERE module_document_id IN (
        SELECT id FROM public.module_documents WHERE organization_id = current_setting('app.org_id')::uuid
    );
DELETE FROM public.module_document_files
    WHERE module_document_id IN (
        SELECT id FROM public.module_documents WHERE organization_id = current_setting('app.org_id')::uuid
    );
DELETE FROM public.module_documents          WHERE organization_id =  current_setting('app.org_id')::uuid;
DELETE FROM public.inv_board_seat            WHERE organization_id = current_setting('app.org_id')::uuid;
DELETE FROM public.inv_cap_table_snapshot    WHERE organization_id = current_setting('app.org_id')::uuid;
DELETE FROM public.inv_co_investor           WHERE organization_id = current_setting('app.org_id')::uuid;
DELETE FROM public.inv_transaction           WHERE organization_id = current_setting('app.org_id')::uuid;
DELETE FROM public.inv_security_terms        WHERE organization_id = current_setting('app.org_id')::uuid;
DELETE FROM public.inv_security              WHERE organization_id = current_setting('app.org_id')::uuid;
DELETE FROM public.inv_round_terms           WHERE organization_id = current_setting('app.org_id')::uuid;
DELETE FROM public.inv_information_rights    WHERE organization_id = current_setting('app.org_id')::uuid;
DELETE FROM public.inv_fund                  WHERE organization_id = current_setting('app.org_id')::uuid;
DELETE FROM public.inv_financing_round       WHERE organization_id = current_setting('app.org_id')::uuid;
DELETE FROM public.inv_equity_plan_snapshot  WHERE organization_id = current_setting('app.org_id')::uuid;
DELETE FROM public.inv_equity_plan           WHERE organization_id = current_setting('app.org_id')::uuid;
DELETE FROM public.inv_company               WHERE organization_id = current_setting('app.org_id')::uuid;

COMMIT;
