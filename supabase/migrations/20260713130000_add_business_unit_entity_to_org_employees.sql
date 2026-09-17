alter table org_employees
  add column business_unit text,
  add column entity text;

comment on column org_employees.business_unit is
  'Business unit the employee belongs to; free-text, org-defined.';

comment on column org_employees.entity is
  'Legal entity the employee is employed under; free-text, org-defined.';
