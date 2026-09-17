create policy "Allow delete own"
on "public"."contract_comments_attachments"
as permissive
for delete
to authenticated
using ((user_id = auth.uid()));


create policy "Allow update own"
on "public"."contract_comments_attachments"
as permissive
for update
to public
using ((user_id = auth.uid()));



