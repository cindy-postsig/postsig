CREATE TRIGGER audit_contract_docs_trigger AFTER INSERT OR DELETE OR UPDATE ON public.contract_docs FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_contracts_trigger AFTER INSERT OR DELETE OR UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();



