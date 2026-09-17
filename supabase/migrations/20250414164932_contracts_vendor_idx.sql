CREATE INDEX idx_contracts_status_statusid_userid ON public.contracts USING btree (status, status_id, user_id);

CREATE INDEX idx_contracts_vendorid_status ON public.contracts USING btree (vendor_id, status);
