drop policy "Users can insert their own attachments" on "public"."contract_comments_attachments";

create policy "Allow authenticated users to insert their own attachments"
on "public"."contract_comments_attachments"
as permissive
for insert
to authenticated
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "Enable users to view their own data only"
on "public"."contract_comments_attachments"
as permissive
for select
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));



