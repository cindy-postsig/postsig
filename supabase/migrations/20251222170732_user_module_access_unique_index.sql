CREATE UNIQUE INDEX user_module_access_unique ON public.user_module_access USING btree (user_id, organization_id, module_id);


