/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const verifyMFAChallenge = jest.fn();
const verifyEmailMFAChallenge = jest.fn();
jest.mock('@/app/lib/auth/mfa-actions', () => ({
  verifyMFAChallenge: (...args: unknown[]) => verifyMFAChallenge(...args),
  verifyEmailMFAChallenge: (...args: unknown[]) =>
    verifyEmailMFAChallenge(...args),
  challengeEmailMFA: jest.fn().mockResolvedValue({}),
  checkExistingEmailMFAChallenge: jest
    .fn()
    .mockResolvedValue({ hasValidChallenge: true }),
}));
const trustDevice = jest.fn();
jest.mock('@/app/lib/auth/trusted-device-actions', () => ({
  trustDevice: (...args: unknown[]) => trustDevice(...args),
}));
const toast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast }),
}));

import MFAChallenge from '@/components/auth/MFAChallenge';
import EmailMFAChallenge from '@/components/auth/EmailMFAChallenge';

const trustCheckbox = () =>
  screen.queryByRole('checkbox', { name: /Trust this device/ });

const enterCode = () =>
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: '123456' },
  });

// input-otp measures its slots and hit-tests the pointer; jsdom has neither
// ResizeObserver nor layout.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  document.elementFromPoint = () => null;
});

beforeEach(() => {
  jest.clearAllMocks();
  verifyMFAChallenge.mockResolvedValue({ success: true });
  verifyEmailMFAChallenge.mockResolvedValue({ success: true });
  trustDevice.mockResolvedValue({ success: true });
});

describe('trusting the device from the code screen', () => {
  it('is offered on the code screen, checked by default, and trusts on a successful verify', async () => {
    const onSuccess = jest.fn();
    render(<MFAChallenge onSuccess={onSuccess} />);

    expect(trustCheckbox()?.getAttribute('aria-checked')).toBe('true');

    enterCode();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(trustDevice).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Device Trusted' }),
    );
  });

  it('leaves the device alone when unticked', async () => {
    const onSuccess = jest.fn();
    render(<MFAChallenge onSuccess={onSuccess} />);

    fireEvent.click(trustCheckbox() as HTMLElement);
    expect(trustCheckbox()?.getAttribute('aria-checked')).toBe('false');

    enterCode();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(trustDevice).not.toHaveBeenCalled();
  });

  it('reports a failed trust and still completes sign-in', async () => {
    trustDevice.mockResolvedValue({ success: false, error: 'nope' });
    const onSuccess = jest.fn();
    render(<MFAChallenge onSuccess={onSuccess} />);

    enterCode();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        title: 'Device Trust Failed',
      }),
    );
  });

  it('is absent where trusting makes no sense, and never trusts there', async () => {
    const onSuccess = jest.fn();
    render(<MFAChallenge onSuccess={onSuccess} skipTrustDeviceOption />);

    expect(trustCheckbox()).toBeNull();
    enterCode();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(trustDevice).not.toHaveBeenCalled();
  });

  it('works the same on the email code screen', async () => {
    const onSuccess = jest.fn();
    render(<EmailMFAChallenge onSuccess={onSuccess} />);

    await waitFor(() =>
      expect(trustCheckbox()?.getAttribute('aria-checked')).toBe('true'),
    );
    enterCode();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(trustDevice).toHaveBeenCalledTimes(1);
  });
});
