create policy "Give users access to own folder 1qjs288_0" on "storage"."objects" as permissive for
select
    to public using (
        (
            (bucket_id = 'contract_docs' :: text)
            AND (
                (auth.uid()) :: text = (storage.foldername(name)) [1]
            )
        )
    );

create policy "Give users access to own folder 1qjs288_1" on "storage"."objects" as permissive for
insert
    to public with check (
        (
            (bucket_id = 'contract_docs' :: text)
            AND (
                (auth.uid()) :: text = (storage.foldername(name)) [1]
            )
        )
    );

create policy "Give users access to own folder 1qjs288_2" on "storage"."objects" as permissive for
update
    to public using (
        (
            (bucket_id = 'contract_docs' :: text)
            AND (
                (auth.uid()) :: text = (storage.foldername(name)) [1]
            )
        )
    );