alter table "public"."contract_comments" drop constraint "contract_comments_user_id_fkey1";

alter table "public"."contract_comments" drop constraint "contract_comments_user_id_fkey";

alter table "public"."contract_comments" add constraint "contract_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) not valid;

alter table "public"."contract_comments" validate constraint "contract_comments_user_id_fkey";
