import { buildEmployeeRow } from '@/data/superuser/_employee-row';

const base = {
  organization_id: 'org-1',
  first_name: '  Ada  ',
  last_name: 'Lovelace',
};

describe('buildEmployeeRow', () => {
  it('trims names and lowercases the email', () => {
    const row = buildEmployeeRow({ ...base, email: '  Ada@Example.COM ' });
    expect(row.first_name).toBe('Ada');
    expect(row.email).toBe('ada@example.com');
  });

  it('nulls placeholder values', () => {
    const row = buildEmployeeRow({
      ...base,
      department: 'n/a',
      team: '-',
      entity: 'none',
      region: '',
    });
    expect(row.department).toBeNull();
    expect(row.team).toBeNull();
    expect(row.entity).toBeNull();
    expect(row.region).toBeNull();
  });

  // The same row shape feeds insert and update. An explicit null would fail the
  // not-null status column on insert and reset a manual 'on_leave' on update,
  // so the key must be absent entirely when no status was derived.
  describe('conditional keys', () => {
    it('omits status when it is undefined', () => {
      const row = buildEmployeeRow(base);
      expect('status' in row).toBe(false);
    });

    it('includes status when it is set', () => {
      const row = buildEmployeeRow({ ...base, status: 'inactive' });
      expect(row).toHaveProperty('status', 'inactive');
    });

    // The business group is not a row column: membership rides org_unit_id via
    // the upsert walk, and legacy group_id is frozen.
    it('never emits a group column, even when a node was submitted', () => {
      const row = buildEmployeeRow({ ...base, business_group_node_id: 7 });
      expect('group_id' in row).toBe(false);
      expect('business_group_node_id' in row).toBe(false);
    });
  });

  it('nulls dates that were not provided', () => {
    const row = buildEmployeeRow(base);
    expect(row.start_date).toBeNull();
    expect(row.leave_date).toBeNull();
  });
});
