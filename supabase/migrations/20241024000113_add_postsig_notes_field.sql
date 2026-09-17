alter type "public"."ai_extraction_status" rename to "ai_extraction_status__old_version_to_be_dropped";

create type "public"."ai_extraction_status" as enum ('ai_success', 'ai_failed', 'h_success', 'h_failed', 'ext_failed', 'ext_success');

alter table "public"."contracts" alter column ai_extraction_status type "public"."ai_extraction_status" using ai_extraction_status::text::"public"."ai_extraction_status";

drop type "public"."ai_extraction_status__old_version_to_be_dropped";


