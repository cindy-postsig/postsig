set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.contracts_visible_to(p_organization_id uuid, p_user_id uuid)
 RETURNS TABLE(id bigint, perm permission_level)
 LANGUAGE sql
 STABLE
AS $function$
with direct_perms as (
  select cu.contract_id as id, max(cu.perm) as perm
  from public.contract_acl_user cu
  where cu.organization_id = p_organization_id
    and cu.user_id = p_user_id
  group by cu.contract_id

  union all

  select cg.contract_id as id, max(cg.perm) as perm
  from public.contract_acl_group cg
  join public.group_members gm
    on gm.organization_id = p_organization_id
   and gm.group_id = cg.group_id
   and gm.user_id = p_user_id
  where cg.organization_id = p_organization_id
  group by cg.contract_id

  union all
  
  -- implicit owner-admin if your contracts.user_id is the owner and user role is manager or admin (11, 12)
  select c.id, 'admin'::permission_level
  from public.contracts c
  join public.user_roles2 ur on ur.user_id = c.user_id 
  where c.organization_id = p_organization_id
    and c.user_id = p_user_id
    and ur.role_id in (1, 2, 11, 12)
),
supervisor_perms as (
  -- org admins (role 12) get admin access to ALL contracts in their org
  select c.id, 'admin'::permission_level as perm
  from public.contracts c
  join public.user_roles2 ur on ur.user_id = p_user_id
  where c.organization_id = p_organization_id
    and ur.role_id = 12
),
inherited_perms as (
  -- folder inheritance via ltree
  select fc.contract_id as id,
         max(coalesce(fau.perm, fag.perm)) as perm
  from public.folder_contracts fc
  join public.folders f_child
    on f_child.id = fc.folder_id
   and f_child.organization_id = p_organization_id
  left join public.folder_acl_user fau
    on fau.organization_id = p_organization_id
   and fau.user_id = p_user_id
  left join public.folders f_u on f_u.id = fau.folder_id
  left join public.group_members gm
    on gm.organization_id = p_organization_id
   and gm.user_id = p_user_id
  left join public.folder_acl_group fag
    on fag.organization_id = p_organization_id
   and fag.group_id = gm.group_id
  left join public.folders f_g on f_g.id = fag.folder_id
  where fc.organization_id = p_organization_id
    and ((f_u.path @> f_child.path) or (f_g.path @> f_child.path))
  group by fc.contract_id
),
all_perms as (
  select * from direct_perms
  union all
  select * from supervisor_perms
  union all
  select * from inherited_perms
)
select id, max(perm) as perm
from all_perms
group by id;
$function$
;

CREATE OR REPLACE FUNCTION public.folders_visible_to(p_organization_id uuid, p_user_id uuid)
 RETURNS TABLE(id bigint, perm permission_level)
 LANGUAGE sql
 STABLE
AS $function$
with user_grants as (
  select f.id, f.path, fau.perm
  from public.folder_acl_user fau
  join public.folders f
    on f.id = fau.folder_id
   and f.organization_id = p_organization_id
  where fau.organization_id = p_organization_id
    and fau.user_id = p_user_id
),
group_grants as (
  select f.id, f.path, fag.perm
  from public.folder_acl_group fag
  join public.group_members gm
    on gm.organization_id = p_organization_id
   and gm.group_id = fag.group_id
   and gm.user_id = p_user_id
  join public.folders f
    on f.id = fag.folder_id
   and f.organization_id = p_organization_id
  where fag.organization_id = p_organization_id
),
grant_nodes as (
  select * from user_grants
  union all
  select * from group_grants
),
inherited as (
  select f_child.id, max(gn.perm) as perm
  from public.folders f_child
  join grant_nodes gn
    on gn.path @> f_child.path
  where f_child.organization_id = p_organization_id
  group by f_child.id
),
supervisor_perms as (
  -- supervisors (role 12) get admin access to ALL folders in their org
  select f.id, 'admin'::permission_level as perm
  from public.folders f
  join public.user_roles2 ur on ur.user_id = p_user_id
  where f.organization_id = p_organization_id
    and ur.role_id = 12
),
all_perms as (
  select * from inherited
  union all
  select * from supervisor_perms
)
select id, max(perm) as perm
from all_perms
group by id;
$function$
;

CREATE OR REPLACE FUNCTION public.is_folder_admin(p_org uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  -- only org admin has direct ownership
  select public.user_has_role_in_org(p_user, p_org, array[12]::int[]);
$function$
;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  -- 12 org admin;
  select public.user_has_role_in_org(p_user, p_org, array[12]::int[]);
$function$
;

CREATE OR REPLACE FUNCTION public.users_who_can_see_contracts(p_contract_ids bigint[], p_organization_id uuid)
 RETURNS TABLE(contract_id bigint, user_id uuid, email text, name text, organization_id uuid, perm permission_level, signed_up boolean, permission_sources text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH 
-- 1. Users with direct ACL grants on these contracts
direct_user_acl AS (
  SELECT cu.contract_id, cu.user_id, cu.perm, 'direct_acl'::text AS source
  FROM public.contract_acl_user cu
  WHERE cu.contract_id = ANY(p_contract_ids)
    AND cu.organization_id = p_organization_id
),

-- 2. Users via group memberships
group_based_acl AS (
  SELECT cg.contract_id, gm.user_id, cg.perm, 'group_membership'::text AS source
  FROM public.contract_acl_group cg
  JOIN public.group_members gm
    ON gm.organization_id = p_organization_id
   AND gm.group_id = cg.group_id
  WHERE cg.contract_id = ANY(p_contract_ids)
    AND cg.organization_id = p_organization_id
),

-- 3. Folder inheritance
folder_inheritance AS (
  SELECT DISTINCT fc.contract_id, fau.user_id, fau.perm, 'folder_inheritance'::text AS source
  FROM public.folder_contracts fc
  JOIN public.folders f_child
    ON f_child.id = fc.folder_id
   AND f_child.organization_id = p_organization_id
  JOIN public.folder_acl_user fau
    ON fau.organization_id = p_organization_id
  JOIN public.folders f_acl
    ON f_acl.id = fau.folder_id
   AND f_acl.organization_id = p_organization_id
  WHERE fc.contract_id = ANY(p_contract_ids)
    AND (f_acl.path = f_child.path OR f_child.path <@ f_acl.path)

  UNION

  SELECT DISTINCT fc.contract_id, gm.user_id, fag.perm, 'folder_group_inheritance'::text AS source
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
  WHERE fc.contract_id = ANY(p_contract_ids)
    AND (f_acl.path = f_child.path OR f_child.path <@ f_acl.path)
),

-- 4. Org admins get admin on all contracts
org_admins AS (
  SELECT 
    c.id as contract_id,
    u.id AS user_id,
    'admin'::permission_level AS perm,
    'org_admin'::text AS source
  FROM public.contracts c
  CROSS JOIN public.users u
  JOIN public.user_roles2 ur ON ur.user_id = u.id
  WHERE c.id = ANY(p_contract_ids)
    AND c.organization_id = p_organization_id
    AND u.organization_id = p_organization_id
    AND ur.role_id IN (1, 2, 12)
),

-- Combine all sources (now with source tracking)
all_permissions AS (
  SELECT contract_id, user_id, perm, source FROM direct_user_acl
  UNION ALL
  SELECT contract_id, user_id, perm, source FROM group_based_acl
  UNION ALL
  SELECT contract_id, user_id, perm, source FROM folder_inheritance
  UNION ALL
  SELECT contract_id, user_id, perm, source FROM org_admins
),

-- Aggregate to get max permission AND collect all sources per user per contract
aggregated_permissions AS (
  SELECT 
    ap.contract_id,
    ap.user_id,
    MAX(ap.perm) AS perm,
    array_agg(DISTINCT ap.source ORDER BY ap.source) AS permission_sources
  FROM all_permissions ap
  GROUP BY ap.contract_id, ap.user_id
)

-- Join with users table to get email, name, signed_up, and organization_id
SELECT 
  ap.contract_id,
  ap.user_id,
  u.email,
  u.name,
  u.organization_id,
  ap.perm,
  u.signed_up,
  ap.permission_sources
FROM aggregated_permissions ap
JOIN public.users u ON u.id = ap.user_id
$function$
;


