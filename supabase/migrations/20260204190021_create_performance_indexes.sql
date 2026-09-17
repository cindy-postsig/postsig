-- ADDITIONAL INDEXES FOR VIEW PERFORMANCE

-- For v_inv_company_valuation LATERAL join performance
CREATE INDEX IF NOT EXISTS idx_inv_cap_snapshot_latest
    ON inv_cap_table_snapshot(company_id, snapshot_date DESC)
    INCLUDE (share_price, our_total_shares, our_fd_ownership_percent);

-- For transaction aggregations by company
CREATE INDEX IF NOT EXISTS idx_inv_transaction_company_type
    ON inv_transaction(company_id, transaction_type)
    INCLUDE (amount, units);

-- For information rights active lookup
CREATE INDEX IF NOT EXISTS idx_inv_info_rights_company_effective
    ON inv_information_rights(company_id, effective_date)
    WHERE expiration_date IS NULL;
