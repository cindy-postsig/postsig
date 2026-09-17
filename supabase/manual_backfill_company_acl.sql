-- One-off backfill: grant existing reporting-request recipients access to their
-- company via inv_company_acl_user, so the portco app can resolve their company
-- for self-serve reporting. Going forward this row is written at request-send time
-- (see provisionAndEmailRecipient). Run on each existing DB (local + dev remote);
-- idempotent via ON CONFLICT.
--
-- The ACL FK requires (organization_id, user_id) to exist in users, so the join
-- skips recipients whose user belongs to a different org than the request.
INSERT INTO inv_company_acl_user (company_id, organization_id, user_id, perm)
SELECT DISTINCT r.company_id, r.organization_id, r.recipient_user_id, 'write'::permission_level
FROM inv_reporting_request r
JOIN users u
  ON u.id = r.recipient_user_id
 AND u.organization_id = r.organization_id
WHERE r.recipient_user_id IS NOT NULL
ON CONFLICT (company_id, user_id) DO NOTHING;
