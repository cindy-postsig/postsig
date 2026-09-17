drop policy "Allow authenticated users to insert their own attachments" on "public"."contract_comments_attachments";

drop policy "Enable users to view their own data only" on "public"."contract_comments_attachments";

create policy "Allow authenticated users to insert their own attachments"
on "public"."contract_comments_attachments"
as permissive
for insert
to authenticated
with check (true);


create policy "Enable users to view their own data only"
on "public"."contract_comments_attachments"
as permissive
for select
to authenticated
using (true);



