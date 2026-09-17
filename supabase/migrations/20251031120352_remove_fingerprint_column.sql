drop index if exists "public"."idx_trusted_devices_fingerprint";

alter table "public"."trusted_devices" drop column "device_fingerprint";


