import { z } from 'zod';

export const NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 255;
export const IMPORTED_NAME_MAX_LENGTH = 255;

const NAME_ALLOWED_CHARS = /^[\p{L}\p{M}\p{N} '’,.\-]+$/u;

export function normalizeImportedName(value: string): string {
  return value.trim().slice(0, IMPORTED_NAME_MAX_LENGTH);
}

export function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const nameField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, { error: `${label} is required` })
    .max(NAME_MAX_LENGTH, {
      error: `${label} must be ${NAME_MAX_LENGTH} characters or fewer`,
    })
    .regex(NAME_ALLOWED_CHARS, {
      error: `${label} contains unsupported characters`,
    });

export const employeeSchema = z
  .object({
    first_name: nameField('First name'),
    last_name: nameField('Last name'),
    email: z
      .string()
      .trim()
      .max(EMAIL_MAX_LENGTH, {
        error: `Email must be ${EMAIL_MAX_LENGTH} characters or fewer`,
      })
      .refine((value) => value === '' || z.regexes.email.test(value), {
        error: 'Invalid email format',
      }),
    employee_id: z.string().optional(),
    region: z.string().optional(),
    country: z.string().optional(),
    division: z.string().optional(),
    department: z.string().optional(),
    cost_center: z.string().optional(),
    business_unit: z.string().optional(),
    entity: z.string().optional(),
    team: z.string().optional(),
    business_group_node_id: z.string().optional(),
    start_date: z.string().optional(),
    leave_date: z.string().optional(),
    status: z.enum(['active', 'inactive', 'on_leave']).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.start_date &&
      data.leave_date &&
      data.leave_date < data.start_date
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Leave date cannot be earlier than start date',
        path: ['leave_date'],
      });
    }

    if (
      data.status === 'active' &&
      data.leave_date &&
      data.leave_date < todayIsoDate()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Leave date is in the past. Clear it or set a future date to mark this employee active.',
        path: ['leave_date'],
      });
    }
  });
