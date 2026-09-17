CREATE TRIGGER audit_contract_acl_group_trigger AFTER INSERT OR DELETE OR UPDATE ON public.contract_acl_group FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_contract_acl_user_trigger AFTER INSERT OR DELETE OR UPDATE ON public.contract_acl_user FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_folder_acl_group_trigger AFTER INSERT OR DELETE OR UPDATE ON public.folder_acl_group FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_folder_acl_user_trigger AFTER INSERT OR DELETE OR UPDATE ON public.folder_acl_user FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_folder_contracts_trigger AFTER INSERT OR DELETE OR UPDATE ON public.folder_contracts FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_folders_trigger AFTER INSERT OR DELETE OR UPDATE ON public.folders FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_group_members_trigger AFTER INSERT OR DELETE OR UPDATE ON public.group_members FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_groups_trigger AFTER INSERT OR DELETE OR UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();


