/**
 * @jest-environment jsdom
 *
 * The form must hold both buttons shut for exactly the wait it was handed.
 */
jest.mock('@/data/users', () => ({ signInWithPassword: jest.fn() }));
jest.mock('@/utils/supabase/client', () => ({ createClient: jest.fn() }));
jest.mock('@/app/hooks/useAuthStatus', () => ({
  useAuthStatus: () => ({
    isLoading: false,
    isAuthenticated: false,
    needsMFA: false,
    user: null,
    mfaType: null,
  }),
}));
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('next/image', () => ({
  __esModule: true,
  default: () => null,
}));

import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import LoginForm from '@/components/login-form';
import { signInWithPassword } from '@/data/users';

const mockSignIn = signInWithPassword as jest.Mock;

const EMAIL = 'user@example.com';

function renderForm() {
  render(<LoginForm message="" rid="" redirect="/" />);
}

/** Fills the form and submits it, letting the action's promise settle. */
async function submit() {
  fireEvent.change(screen.getByPlaceholderText('email'), {
    target: { value: EMAIL },
  });
  fireEvent.change(screen.getByPlaceholderText('password'), {
    target: { value: 'wrong-password' },
  });
  await act(async () => {
    fireEvent.submit(screen.getByPlaceholderText('email').closest('form')!);
  });
}

const signInButton = () => screen.getByRole('button', { name: /sign in$/i });
const ssoButton = () =>
  screen.getByRole('button', { name: /sign in with sso/i });

/** Advances the countdown by whole seconds. */
async function tick(seconds: number) {
  for (let i = 0; i < seconds; i++) {
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  }
}

describe('login form lockout countdown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts a refusal down and holds both buttons shut until it expires', async () => {
    mockSignIn.mockResolvedValue({
      state: false,
      requiresMFA: false,
      rateLimited: { retryAfterSeconds: 3 },
    });
    renderForm();
    await submit();

    expect(
      screen.getByText('Too many attempts. Please try again in 3s.'),
    ).toBeTruthy();
    expect(signInButton().hasAttribute('disabled')).toBe(true);
    expect(ssoButton().hasAttribute('disabled')).toBe(true);

    await tick(1);
    expect(
      screen.getByText('Too many attempts. Please try again in 2s.'),
    ).toBeTruthy();
    expect(signInButton().hasAttribute('disabled')).toBe(true);

    await tick(2);
    expect(screen.queryByText(/Too many attempts/)).toBeNull();
    expect(signInButton().hasAttribute('disabled')).toBe(false);
    expect(ssoButton().hasAttribute('disabled')).toBe(false);
  });

  // A disabled submit button does not stop the Enter key in every browser, so
  // the handler refuses on its own rather than trusting the markup.
  it('does not call the server again while the countdown runs', async () => {
    mockSignIn.mockResolvedValue({
      state: false,
      requiresMFA: false,
      rateLimited: { retryAfterSeconds: 30 },
    });
    renderForm();
    await submit();
    expect(mockSignIn).toHaveBeenCalledTimes(1);

    await submit();
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('warns how many attempts are left once the lockout is close', async () => {
    mockSignIn.mockResolvedValue({
      state: false,
      requiresMFA: false,
      invalidCredentials: { attemptsRemaining: 4, lockedForSeconds: null },
    });
    renderForm();
    await submit();

    expect(
      screen.getByText(
        '4 attempts remaining before this account is locked for at least 15 minutes.',
      ),
    ).toBeTruthy();
    expect(signInButton().hasAttribute('disabled')).toBe(false);
  });

  it('stays quiet about the count while the lockout is still far off', async () => {
    mockSignIn.mockResolvedValue({
      state: false,
      requiresMFA: false,
      invalidCredentials: { attemptsRemaining: 8, lockedForSeconds: null },
    });
    renderForm();
    await submit();

    expect(
      screen.getByText(/email or password you entered is incorrect/i),
    ).toBeTruthy();
    expect(screen.queryByText(/attempts remaining/)).toBeNull();
  });

  it('keeps the attempts warning visible while a cooldown counts down', async () => {
    mockSignIn.mockResolvedValueOnce({
      state: false,
      requiresMFA: false,
      invalidCredentials: { attemptsRemaining: 4, lockedForSeconds: null },
    });
    renderForm();
    await submit();

    expect(screen.getByText(/4 attempts remaining/)).toBeTruthy();

    mockSignIn.mockResolvedValueOnce({
      state: false,
      requiresMFA: false,
      rateLimited: { retryAfterSeconds: 10 },
    });
    await submit();

    expect(screen.getByText(/4 attempts remaining/)).toBeTruthy();
    expect(
      screen.getByText('Too many attempts. Please try again in 10s.'),
    ).toBeTruthy();
  });

  // The pacing case: the password *was* checked, so "too many attempts" beside
  // a remaining count would contradict itself. It holds the button instead, so
  // the next password the user types is one the server will actually look at.
  it('holds the next attempt with friendlier wording after a counted failure', async () => {
    mockSignIn.mockResolvedValue({
      state: false,
      requiresMFA: false,
      invalidCredentials: {
        attemptsRemaining: 4,
        lockedForSeconds: null,
        nextAttemptInSeconds: 20,
      },
    });
    renderForm();
    await submit();

    expect(
      screen.getByText(/email or password you entered is incorrect/i),
    ).toBeTruthy();
    expect(screen.getByText(/4 attempts remaining/)).toBeTruthy();
    expect(screen.getByText('You can try again in 20s.')).toBeTruthy();
    expect(screen.queryByText(/Too many attempts/)).toBeNull();
    expect(signInButton().hasAttribute('disabled')).toBe(true);

    await tick(20);
    expect(signInButton().hasAttribute('disabled')).toBe(false);
    expect(screen.getByText(/4 attempts remaining/)).toBeTruthy();
  });

  // The lock lands on this attempt; waiting for the next one to be refused
  // would leave the user hammering a button that cannot work.
  it('starts the countdown on the failure that locks the account', async () => {
    mockSignIn.mockResolvedValue({
      state: false,
      requiresMFA: false,
      invalidCredentials: { attemptsRemaining: 0, lockedForSeconds: 900 },
    });
    renderForm();
    await submit();

    expect(
      screen.getByText('Too many attempts. Please try again in 15:00.'),
    ).toBeTruthy();
    expect(screen.queryByText(/attempts remaining/)).toBeNull();
    expect(signInButton().hasAttribute('disabled')).toBe(true);
  });

  // Null means the limiter could not count the failure, so there is no figure
  // to stand behind and the form must not invent one.
  it('shows no count when the limiter could not report one', async () => {
    mockSignIn.mockResolvedValue({
      state: false,
      requiresMFA: false,
      invalidCredentials: { attemptsRemaining: null, lockedForSeconds: null },
    });
    renderForm();
    await submit();

    expect(
      screen.getByText(/email or password you entered is incorrect/i),
    ).toBeTruthy();
    expect(screen.queryByText(/attempts remaining/)).toBeNull();
    expect(signInButton().hasAttribute('disabled')).toBe(false);
  });
});
