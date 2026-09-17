alter table "public"."user_roles2" drop constraint "user_roles2_user_id_fkey";

alter table "public"."user_roles2" add constraint "user_roles2_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."user_roles2" validate constraint "user_roles2_user_id_fkey";


