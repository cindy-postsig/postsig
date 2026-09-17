drop policy if exists "Users can update own profile." on "public"."users";

create policy "Users can update own profile."
on "public"."users"
as permissive
for update
to authenticated  
using (auth.uid() = id)  
with check (auth.uid() = id); 



