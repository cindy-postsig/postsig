alter table users
  add column date_format text;

comment on column users.date_format is
  'User preferred date format category: EU | ISO | US. NULL = inherit the organization default (organizations.date_format).';
