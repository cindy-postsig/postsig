alter table org_employees
  add column team text;

comment on column org_employees.team is
  'Team the employee belongs to; free-text, org-defined.';
