set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.users_who_can_see_contract(p_contract_id bigint, p_organization_id uuid)
 RETURNS TABLE(user_id uuid, email text, organization_id uuid, perm permission_level)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH 
-- 1. Users with direct ACL grants on this contract
direct_user_acl AS (
  SELECT cu.user_id, cu.perm
  FROM public.contract_acl_user cu
  WHERE cu.contract_id = p_contract_id
    AND cu.organization_id = p_organization_id
),

-- 2. Users via group memberships with ACL on this contract
group_based_acl AS (
  SELECT gm.user_id, cg.perm
  FROM public.contract_acl_group cg
  JOIN public.group_members gm
    ON gm.organization_id = p_organization_id
   AND gm.group_id = cg.group_id
  WHERE cg.contract_id = p_contract_id
    AND cg.organization_id = p_organization_id
),

-- 3. Contract owner gets implicit admin
contract_owner AS (
  SELECT c.user_id, 'admin'::permission_level AS perm
  FROM public.contracts c
  WHERE c.id = p_contract_id
    AND c.organization_id = p_organization_id
    AND c.user_id IS NOT NULL
),

-- 4. Users with folder ACL inheritance
folder_inheritance AS (
  SELECT DISTINCT fau.user_id, fau.perm
  FROM public.folder_contracts fc
  JOIN public.folders f_child
    ON f_child.id = fc.folder_id
   AND f_child.organization_id = p_organization_id
  JOIN public.folder_acl_user fau
    ON fau.organization_id = p_organization_id
  JOIN public.folders f_acl
    ON f_acl.id = fau.folder_id
   AND f_acl.organization_id = p_organization_id
  WHERE fc.contract_id = p_contract_id
    AND (f_acl.path = f_child.path OR f_child.path <@ f_acl.path)

  UNION

  SELECT DISTINCT gm.user_id, fag.perm
  FROM public.folder_contracts fc
  JOIN public.folders f_child
    ON f_child.id = fc.folder_id
   AND f_child.organization_id = p_organization_id
  JOIN public.folder_acl_group fag
    ON fag.organization_id = p_organization_id
  JOIN public.folders f_acl
    ON f_acl.id = fag.folder_id
   AND f_acl.organization_id = p_organization_id
  JOIN public.group_members gm
    ON gm.organization_id = p_organization_id
   AND gm.group_id = fag.group_id
  WHERE fc.contract_id = p_contract_id
    AND (f_acl.path = f_child.path OR f_child.path <@ f_acl.path)
),

-- 5. Org admins and supervisors get admin on all contracts
org_admins AS (
  SELECT u.id AS user_id, 'admin'::permission_level AS perm
  FROM public.users u
  JOIN public.user_roles2 ur ON ur.user_id = u.id
  WHERE u.organization_id = p_organization_id
    AND ur.role_id IN (1, 2, 11, 12) -- postsig admin, postsig supervisor, client admin, client supervisor
    AND EXISTS (
      SELECT 1 FROM public.contracts c 
      WHERE c.id = p_contract_id 
        AND c.organization_id = p_organization_id
    )
),

-- Combine all sources
all_permissions AS (
  SELECT user_id, perm FROM direct_user_acl
  UNION ALL
  SELECT user_id, perm FROM group_based_acl
  UNION ALL
  SELECT user_id, perm FROM contract_owner
  UNION ALL
  SELECT user_id, perm FROM folder_inheritance
  UNION ALL
  SELECT user_id, perm FROM org_admins
),

-- Aggregate to get max permission per user
aggregated_permissions AS (
  SELECT ap.user_id, MAX(ap.perm) AS perm
  FROM all_permissions ap
  GROUP BY ap.user_id
)

-- Join with users table to get email and organization_id
SELECT 
  ap.user_id,
  u.email,
  u.organization_id,
  ap.perm
FROM aggregated_permissions ap
JOIN public.users u ON u.id = ap.user_id
$function$
;

GRANT EXECUTE ON FUNCTION public.users_who_can_see_contract(bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.users_who_can_see_contract(bigint, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.users_who_can_see_contract(bigint, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.users_who_can_see_contract(bigint, uuid) FROM public;


