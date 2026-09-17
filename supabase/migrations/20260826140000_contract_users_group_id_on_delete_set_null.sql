-- Let a sharing group be deleted again.
--
-- contract_users.group_id is the frozen HR "business group" snapshot: PSK-1846
-- moved business-group membership onto org_units, and a seat now derives its
-- group by walking org_employee_id -> org_employees.org_unit_id. Nothing reads
-- or writes this column any more (see __tests__/org-units/group-id-freeze.test.ts);
-- it is kept only for rollback.
--
-- Its constraint arrived in 20260216132210 with no delete rule, so a frozen
-- snapshot vetoes an ACL operation: deleting a sharing group fails with
-- "still referenced from table contract_users" whenever that group was ever
-- stamped onto a seat. Every other reference to groups(id) already resolves
-- itself -- the ACL tables and group_members cascade, and org_employees.group_id,
-- frozen by the same change, is ON DELETE SET NULL.
--
-- SET NULL matches that sibling and costs nothing: a group_id pointing at a
-- deleted group would be dangling, so null is the only value a rollback could
-- honestly read.

alter table "public"."contract_users"
  drop constraint "contract_users_group_id_fkey";

alter table "public"."contract_users"
  add constraint "contract_users_group_id_fkey"
  foreign key ("group_id") references "public"."groups"("id") on delete set null;
