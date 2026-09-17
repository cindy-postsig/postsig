alter table "public"."inv_round_terms" alter column "required_closing_payments" drop default;

alter table "public"."inv_round_terms"
  alter column "required_closing_payments" set data type boolean
  using case
    when "required_closing_payments" is null then null
    when lower(trim("required_closing_payments"::text)) in ('true', 't', 'yes', 'y', '1', 'on') then true
    else false
  end;

alter table "public"."inv_round_terms" alter column "required_closing_payments" set default false;