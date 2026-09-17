alter table organizations
  add column date_format text not null default 'yyyy-MM-dd';

comment on column organizations.date_format is
  'Preferred date display format for the org, expressed as a date-fns/Unicode pattern (e.g. yyyy-MM-dd).';
