alter table public.inv_reporting_request
  add column last_reminder_at timestamptz;

comment on column public.inv_reporting_request.last_reminder_at is
  'Last time the investor sent a fill-out reminder to the recipients; gates reminder frequency.';
