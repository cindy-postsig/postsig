CREATE INDEX IF NOT EXISTS integration_sync_logs_details_contract_id_idx
    ON public.integration_sync_logs ((details->>'contract_id'))
    WHERE details ? 'contract_id';
