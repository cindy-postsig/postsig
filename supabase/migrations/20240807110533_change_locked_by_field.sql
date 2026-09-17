alter table "public"."contracts" add constraint "contracts_locked_by_fkey" FOREIGN KEY (locked_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."contracts" validate constraint "contracts_locked_by_fkey";


