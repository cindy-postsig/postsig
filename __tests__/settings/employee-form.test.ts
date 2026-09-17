import {
  EMAIL_MAX_LENGTH,
  IMPORTED_NAME_MAX_LENGTH,
  NAME_MAX_LENGTH,
  employeeSchema,
  normalizeImportedName,
} from '@/lib/settings/employee-form';

const baseForm = {
  first_name: 'Jane',
  last_name: 'Doe',
  email: 'jane.doe@example.com',
  employee_id: '',
  region: '',
  country: '',
  division: '',
  department: '',
  cost_center: '',
  business_unit: '',
  entity: '',
  team: '',
  business_group_node_id: '',
  start_date: '',
  leave_date: '',
  status: 'active' as const,
};

function errorsByField(form: typeof baseForm): Record<string, string> {
  const parsed = employeeSchema.safeParse(form);
  if (parsed.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !errors[key]) {
      errors[key] = issue.message;
    }
  }
  return errors;
}

describe('employeeSchema', () => {
  it('accepts a typical employee', () => {
    expect(employeeSchema.safeParse(baseForm).success).toBe(true);
  });

  it('accepts populated business unit, entity, and team values', () => {
    const parsed = employeeSchema.safeParse({
      ...baseForm,
      business_unit: 'Retail Banking',
      entity: 'PostSig UK Ltd',
      team: 'Payments',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.business_unit).toBe('Retail Banking');
      expect(parsed.data.entity).toBe('PostSig UK Ltd');
      expect(parsed.data.team).toBe('Payments');
    }
  });

  it('treats business unit, entity, and team as optional', () => {
    const {
      business_unit: _bu,
      entity: _entity,
      team: _team,
      ...withoutFields
    } = baseForm;
    expect(employeeSchema.safeParse(withoutFields).success).toBe(true);
  });

  it('accepts international and punctuated names', () => {
    for (const name of [
      'José',
      "O'Brien",
      'Anne-Marie',
      '李小龙',
      'St. John',
    ]) {
      expect(errorsByField({ ...baseForm, first_name: name })).toEqual({});
    }
  });

  it('requires first and last name', () => {
    const errors = errorsByField({
      ...baseForm,
      first_name: '',
      last_name: '   ',
    });
    expect(errors.first_name).toBe('First name is required');
    expect(errors.last_name).toBe('Last name is required');
  });

  it('rejects names longer than the limit', () => {
    const errors = errorsByField({
      ...baseForm,
      first_name: 'a'.repeat(NAME_MAX_LENGTH + 1),
    });
    expect(errors.first_name).toBe(
      `First name must be ${NAME_MAX_LENGTH} characters or fewer`,
    );
  });

  it('accepts names at exactly the limit', () => {
    expect(
      errorsByField({ ...baseForm, first_name: 'a'.repeat(NAME_MAX_LENGTH) }),
    ).toEqual({});
  });

  it('rejects emoji and symbol characters in names', () => {
    for (const name of ['Jane 😀', '🔥🔥🔥', 'Jane@Doe', 'a<script>']) {
      const errors = errorsByField({ ...baseForm, first_name: name });
      expect(errors.first_name).toBe(
        'First name contains unsupported characters',
      );
    }
  });

  it('rejects newlines and tabs inside names', () => {
    for (const name of ['Jane\nDoe', 'Jane\tDoe']) {
      const errors = errorsByField({ ...baseForm, first_name: name });
      expect(errors.first_name).toBe(
        'First name contains unsupported characters',
      );
    }
  });

  it('allows an empty email', () => {
    expect(errorsByField({ ...baseForm, email: '' })).toEqual({});
  });

  it('rejects malformed emails', () => {
    for (const email of [
      'not-an-email',
      'jane@',
      '@example.com',
      'a b@c.com',
    ]) {
      const errors = errorsByField({ ...baseForm, email });
      expect(errors.email).toBe('Invalid email format');
    }
  });

  it('rejects emails longer than the limit', () => {
    const errors = errorsByField({
      ...baseForm,
      email: `${'a'.repeat(EMAIL_MAX_LENGTH)}@example.com`,
    });
    expect(errors.email).toBe(
      `Email must be ${EMAIL_MAX_LENGTH} characters or fewer`,
    );
  });

  it('rejects a leave date earlier than the start date', () => {
    const errors = errorsByField({
      ...baseForm,
      start_date: '2026-02-01',
      leave_date: '2026-01-01',
    });
    expect(errors.leave_date).toBe(
      'Leave date cannot be earlier than start date',
    );
  });

  it('rejects an active status with a past leave date', () => {
    const errors = errorsByField({
      ...baseForm,
      start_date: '2020-01-01',
      leave_date: '2020-06-01',
      status: 'active',
    });
    expect(errors.leave_date).toBe(
      'Leave date is in the past. Clear it or set a future date to mark this employee active.',
    );
  });
});

describe('normalizeImportedName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeImportedName('  Jane ')).toBe('Jane');
  });

  it('truncates names longer than the import limit', () => {
    expect(normalizeImportedName('x'.repeat(300))).toHaveLength(
      IMPORTED_NAME_MAX_LENGTH,
    );
  });

  it('keeps names at exactly the import limit', () => {
    const name = 'x'.repeat(IMPORTED_NAME_MAX_LENGTH);
    expect(normalizeImportedName(name)).toBe(name);
  });

  it('trims before truncating', () => {
    expect(normalizeImportedName('  ' + 'x'.repeat(300))).toBe(
      'x'.repeat(IMPORTED_NAME_MAX_LENGTH),
    );
  });
});
