alter table "public"."vendors" add constraint "vendors_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) not valid;
