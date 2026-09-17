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
  
  -- implicit owner-admin for managers(11) and supervisors(12) who created contracts
  select c.id, 'admin'::permission_level
  from public.contracts c
  join public.user_roles2 ur on ur.user_id = p_user_id
  where c.organization_id = p_organization_id
    and c.user_id = p_user_id
    and ur.role_id in (11, 12)
),
supervisor_perms as (
  -- supervisors (role 12) get admin access to ALL contracts in their org
  select c.id, 'admin'::permission_level as perm
  from public.contracts c
  join public.user_roles2 ur on ur.user_id = p_user_id
  where c.organization_id = p_organization_id
    and ur.role_id = 12
),
inherited_perms as (
  -- folder inheritance via ltree - USER ACLs
  select fc.contract_id as id,
         fau.perm as perm
  from public.folder_contracts fc
  join public.folders f_child
    on f_child.id = fc.folder_id
   and f_child.organization_id = p_organization_id
  join public.folder_acl_user fau
    on fau.organization_id = p_organization_id
   and fau.user_id = p_user_id
  join public.folders f_u 
    on f_u.id = fau.folder_id
   and f_u.path @> f_child.path
  where fc.organization_id = p_organization_id

  union all

  -- folder inheritance via ltree - GROUP ACLs
  select fc.contract_id as id,
         fag.perm as perm
  from public.folder_contracts fc
  join public.folders f_child
    on f_child.id = fc.folder_id
   and f_child.organization_id = p_organization_id
  join public.group_members gm
    on gm.organization_id = p_organization_id
   and gm.user_id = p_user_id
  join public.folder_acl_group fag
    on fag.organization_id = p_organization_id
   and fag.group_id = gm.group_id
  join public.folders f_g 
    on f_g.id = fag.folder_id
   and f_g.path @> f_child.path
  where fc.organization_id = p_organization_id
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


