alter table "public"."contracts" drop constraint "contracts_user_id_fkey";

alter table "public"."contracts" add constraint "contracts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE not valid;

alter table "public"."contracts" validate constraint "contracts_user_id_fkey";
