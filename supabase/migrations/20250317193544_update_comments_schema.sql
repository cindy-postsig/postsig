alter table "public"."contract_comments_attachments" drop column "public_url";

alter table "public"."contract_comments_attachments" add column "contract_id" integer;

alter table "public"."contract_comments_attachments" add constraint "contract_comments_attachments_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE not valid;

alter table "public"."contract_comments_attachments" validate constraint "contract_comments_attachments_contract_id_fkey";

-- manually add in storage bucket creation for user_attachments

INSERT INTO storage.buckets (id, name)
VALUES ('user_attachments', 'user_attachments')
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Give users access to own folder x07v3w_0"
ON storage.objects FOR SELECT
TO authenticated
USING ((bucket_id = 'user_attachments'::text) AND (( SELECT (auth.uid())::text AS uid) = (storage.foldername(name))[1]));

CREATE POLICY "Give users access to own folder x07v3w_1"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ((bucket_id = 'user_attachments'::text) AND (( SELECT (auth.uid())::text AS uid) = (storage.foldername(name))[1]));

CREATE POLICY "Give users access to own folder x07v3w_2"
ON storage.objects FOR UPDATE
TO authenticated
USING ((bucket_id = 'user_attachments'::text) AND (( SELECT (auth.uid())::text AS uid) = (storage.foldername(name))[1]));

CREATE POLICY "Give users access to own folder x07v3w_3"
ON storage.objects FOR DELETE
TO authenticated
USING ((bucket_id = 'user_attachments'::text) AND (( SELECT (auth.uid())::text AS uid) = (storage.foldername(name))[1]));
