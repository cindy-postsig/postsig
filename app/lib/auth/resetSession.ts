import { cookies } from 'next/headers';
import { PasswordResetState } from '@/constants/types';

// Constants for timing (in seconds)
const OTP_EXPIRY = 1 * 20 * 60; // 20 minutes
const PASSWORD_UPDATE_WINDOW = 5 * 60; // 5 minutes

export async function setResetEmailCookie(email: string) {
  const cookieStore = await cookies();
  cookieStore.set('temp_email', email, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/password/verify',
    maxAge: OTP_EXPIRY,
  });
}

export async function createResetState(
  email: string,
  recoveryTimestamp: number,
) {
  const resetState: PasswordResetState = {
    email,
    recoveryTimestamp,
    completed: false,
  };
  const cookieStore = await cookies();

  cookieStore.set('password_reset_state', JSON.stringify(resetState), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: PASSWORD_UPDATE_WINDOW,
    path: '/',
  });
}

export async function getResetState(): Promise<PasswordResetState | null> {
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get('password_reset_state');
  if (!stateCookie) return null;

  try {
    const state = JSON.parse(stateCookie.value) as PasswordResetState;
    // Check if the recovery timestamp is still valid
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    if (state.recoveryTimestamp < oneHourAgo) {
      cookieStore.delete('password_reset_state');
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export async function clearResetState(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set('password_reset_state', '', {
    maxAge: 0,
    path: '/',
  });
}
