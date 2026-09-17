-- One-off manual backfill. PRODUCTION ONLY.
--
-- Local, development and staging already applied the original
-- 20260720152000_portco_user_backfill.sql before it was reduced to a no-op.
-- The production deploy of v1.79.5 aborted on contract_acl_user_org_user_fkey,
-- so production alone still needs this, run by hand.
--
-- Moves portco reporting recipients who were wrongly given investor-org
-- membership into the org-less inv_portco_user model.
--
-- Recipients are resolved by email in provisionAndEmailRecipient, so an existing
-- CPM user who is sent a reporting request also satisfies the module/role guard
-- while owning genuine contract, folder or fund access. users.organization_id
-- cannot be nulled while those rows exist -- contract_acl_user,
-- folder_acl_user, inv_fund_acl_user and inv_company_acl_user all reference
-- users(organization_id, id) with ON DELETE CASCADE and no ON UPDATE action,
-- which is exactly what aborted the deploy. Those users are read for exclusion
-- and left untouched; step 1 lists them for a per-user decision.

-- STEP 1 -- review before changing anything. Read-only.
-- Rows marked 'internal' are skipped by step 2 and need a human call.
SELECT
    u.id,
    u.email,
    u.organization_id,
    CASE
        WHEN EXISTS (SELECT 1 FROM contract_acl_user c WHERE c.user_id = u.id)
            OR EXISTS (SELECT 1 FROM folder_acl_user f WHERE f.user_id = u.id)
            OR EXISTS (SELECT 1 FROM inv_fund_acl_user fa WHERE fa.user_id = u.id)
        THEN 'internal -- skipped, holds CPM or fund access'
        ELSE 'external -- will be migrated'
    END AS disposition
FROM users u
WHERE u.organization_id IS NOT NULL
    AND EXISTS (
        SELECT 1
        FROM user_module_access uma
        JOIN app_modules am ON am.id = uma.module_id AND am.code = 'portco'
        WHERE uma.user_id = u.id
    )
    AND EXISTS (
        SELECT 1 FROM user_roles2 ur
        WHERE ur.user_id = u.id AND ur.role_id = 14 -- userRoles.clientUser
    )
    AND NOT EXISTS (
        SELECT 1 FROM user_roles2 ur
        WHERE ur.user_id = u.id AND ur.role_id <> 14
    )
ORDER BY disposition, u.email;

-- STEP 2 -- apply. Re-runnable: the organization_id IS NOT NULL predicate makes
-- already-migrated users drop out of the set.
BEGIN;

-- Snapshot the set first: the statements below delete the clientUser rows that
-- define it, so re-evaluating the predicate mid-transaction would lose the very
-- users being targeted.
CREATE TEMP TABLE portco_backfill_users ON COMMIT DROP AS
SELECT u.id
FROM users u
WHERE u.organization_id IS NOT NULL
    AND EXISTS (
        SELECT 1
        FROM user_module_access uma
        JOIN app_modules am ON am.id = uma.module_id AND am.code = 'portco'
        WHERE uma.user_id = u.id
    )
    AND EXISTS (
        SELECT 1 FROM user_roles2 ur
        WHERE ur.user_id = u.id AND ur.role_id = 14 -- userRoles.clientUser
    )
    AND NOT EXISTS (
        SELECT 1 FROM user_roles2 ur
        WHERE ur.user_id = u.id AND ur.role_id <> 14
    )
    AND NOT EXISTS (SELECT 1 FROM contract_acl_user c WHERE c.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM folder_acl_user f WHERE f.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM inv_fund_acl_user fa WHERE fa.user_id = u.id);

INSERT INTO inv_portco_user (company_id, organization_id, user_id, created_at)
SELECT acl.company_id, acl.organization_id, acl.user_id, acl.created_at
FROM inv_company_acl_user acl
JOIN portco_backfill_users t ON t.id = acl.user_id
ON CONFLICT (company_id, user_id) DO NOTHING;

DELETE FROM inv_company_acl_user acl
USING portco_backfill_users t
WHERE acl.user_id = t.id;

DELETE FROM user_roles2 ur
USING portco_backfill_users t
WHERE ur.user_id = t.id AND ur.role_id = 14; -- userRoles.clientUser

UPDATE users u
SET organization_id = NULL
FROM portco_backfill_users t
WHERE u.id = t.id;

-- update_auth_user_organization_id only writes the metadata key when
-- organization_id IS NOT NULL, so setting it NULL above never clears the stale
-- key -- remove it here exactly as that trigger stored it ('{organization_id}').
UPDATE auth.users au
SET raw_user_meta_data = raw_user_meta_data - 'organization_id'
FROM portco_backfill_users t
WHERE au.id = t.id;

COMMIT;
