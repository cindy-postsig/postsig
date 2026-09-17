alter table "public"."inv_cap_table_snapshot" add column "conversion_shares_issued" bigint;

alter table "public"."inv_cap_table_snapshot" add column "new_money_shares_issued" bigint;

alter table "public"."inv_cap_table_snapshot" add column "pre_money_preferred_outstanding" bigint;