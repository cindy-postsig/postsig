import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain a special character');

export type PasswordValidation = z.infer<typeof passwordSchema>;

export const passwordRequirements = [
  {
    id: 'length',
    label: 'At least 8 characters',
    validator: (value: string) => value.length >= 8,
  },
  {
    id: 'lowercase',
    label: 'One lowercase letter',
    validator: (value: string) => /[a-z]/.test(value),
  },
  {
    id: 'uppercase',
    label: 'One uppercase letter',
    validator: (value: string) => /[A-Z]/.test(value),
  },
  {
    id: 'digit',
    label: 'One number',
    validator: (value: string) => /[0-9]/.test(value),
  },
  {
    id: 'special',
    label: 'One special character',
    validator: (value: string) => /[^a-zA-Z0-9]/.test(value),
  },
] as const;

export function validateEmailDomain(
  email: string,
  targetDomain: string,
): boolean {
  if (!targetDomain) return true;
  if (!email || !email.includes('@')) return true;
  const emailDomain = email.split('@')[1]?.toLowerCase();
  return emailDomain === targetDomain.toLowerCase();
}

export const emailSchema = z.email();

export function isValidEmail(email: string): boolean {
  return emailSchema.safeParse(email).success;
}
