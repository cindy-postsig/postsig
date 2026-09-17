-- Soft-release of a seat: row is kept for history but excluded from
-- active-seat logic (rosters, seat counts, leavers report).
alter table contract_users
  add column if not exists released_at timestamptz;

comment on column contract_users.released_at is
  'When the seat was freed for re-assignment. Non-null rows are history only and excluded from active-seat queries.';
