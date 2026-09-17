-- Shared SQL bucket functions for the coarse upload-outcome buckets used
-- by the admin rollup MVs.
--
-- Two MVs need to bucket each upload row into one of
-- {Duplicate, Failed, Published, Pending}:
--   * admin_org_module_uploads_mv (current totals per (org, module))
--   * admin_org_module_monthly_mv (per-month flow + cumulative — PSK-1531)
--
-- The bucket rules previously lived inline as CASE expressions in the
-- former MV, mirroring cpmStatusLabel / investorStatusLabel in
-- postsig-admin's lib/upload-status.ts. Extracting them now gives both
-- MVs a single source of truth and makes any future caller (fleet-wide
-- trends, dashboard tiles, etc.) trivial to wire up.
--
-- Note: the activity-log MV's per-row `contract_status` is a different,
-- finer-grained label (New / In Progress / Submitted / Reprocessing /
-- Uploaded …) and intentionally NOT routed through these functions.
--
-- Both functions are IMMUTABLE SQL (not plpgsql), so the planner inlines
-- the body — no runtime overhead vs. inline CASE. They touch no tables,
-- so default grants are fine; nothing to lock down.
--
-- Type choices: parameters are plain SQL primitives so callers can pass
-- any equivalent source. Notably:
--   * ai_extraction_status (the enum) must be cast to text at call sites
--     (`col::text`) — Postgres has no implicit enum→text cast.
--   * status_id is bigint to match contracts.status_id; bigint accepts
--     smallint/int via implicit numeric promotion at call sites.

-- Drop any prior signatures so the create is idempotent under signature
-- changes (during iteration). `if exists` is safe on first run.
drop function if exists public.admin_upload_bucket_cpm(boolean, text, int);
drop function if exists public.admin_upload_bucket_cpm(boolean, text, bigint);
drop function if exists public.admin_upload_bucket_investor(int, text, text);
drop function if exists public.admin_upload_bucket_investor(bigint, text, text);

-------------------------------------------------------------------------------
-- 1. CPM bucket
-------------------------------------------------------------------------------

create function public.admin_upload_bucket_cpm(
  is_duplicate boolean,
  ai_extraction_status text,
  status_id bigint
) returns text
language sql
immutable
parallel safe
as $$
  select case
    when is_duplicate then 'Duplicate'
    when ai_extraction_status = 'h_failed' then 'Failed'
    when status_id is not null
         and status_id >= 4
         and status_id <> 5 then 'Published'
    else 'Pending'
  end;
$$;

comment on function public.admin_upload_bucket_cpm(boolean, text, bigint) is
  'Coarse upload-outcome bucket for a CPM contract row. Mirrors '
  'cpmStatusLabel in postsig-admin lib/upload-status.ts. Used by '
  'admin_org_module_uploads_mv and admin_org_module_monthly_mv. '
  'Cast ai_extraction_status to text at call sites.';

-------------------------------------------------------------------------------
-- 2. Investor bucket
-------------------------------------------------------------------------------

create function public.admin_upload_bucket_investor(
  status_id bigint,
  failure_error_code text,
  ai_extraction_status text
) returns text
language sql
immutable
parallel safe
as $$
  select case
    when status_id = 5 then 'Published'
    when failure_error_code = 'DUPLICATE_FILE' then 'Duplicate'
    when failure_error_code in (
      'UNSUPPORTED_FILE_TYPE',
      'FILE_SIZE_EXCEEDED'
    ) then 'Failed'
    when ai_extraction_status = 'h_failed' then 'Failed'
    else 'Pending'
  end;
$$;

comment on function public.admin_upload_bucket_investor(bigint, text, text) is
  'Coarse upload-outcome bucket for an Investor module_document row. '
  'Mirrors investorStatusLabel in postsig-admin lib/upload-status.ts. '
  'Callers pass metadata->''failure''->''error''->>''code'' as '
  'failure_error_code. Used by admin_org_module_uploads_mv and '
  'admin_org_module_monthly_mv. Cast ai_extraction_status to text at '
  'call sites.';
