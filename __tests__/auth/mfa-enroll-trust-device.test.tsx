/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MfaEmailEnrollCard } from '@/components/auth/MfaEmailEnrollCard';
import { MfaTotpEnrollCard } from '@/components/auth/MfaTotpEnrollCard';

jest.mock('@/components/auth/MfaQrCodeView', () => ({
  MfaQrCodeView: () => null,
}));
// The checkbox module carries the server action beside the control; its
// import chain reaches next/cache, which jsdom cannot load.
jest.mock('@/app/lib/auth/trusted-device-actions', () => ({
  trustDevice: jest.fn(),
}));

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

const noop = () => {};
const trustCheckbox = () =>
  screen.queryByRole('checkbox', { name: /Trust this device/ });

describe('trusting the device from the enrolment code cards', () => {
  it('offers the checkbox on both cards and reports the change', () => {
    const onCheckedChange = jest.fn();
    const { unmount } = render(
      <MfaEmailEnrollCard
        userEmail="ada@example.com"
        verificationCode=""
        onVerificationCodeChange={noop}
        onVerify={noop}
        onCancel={noop}
        trustDevice={{ checked: true, onCheckedChange }}
      />,
    );
    expect(trustCheckbox()?.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(trustCheckbox() as HTMLElement);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
    unmount();

    render(
      <MfaTotpEnrollCard
        qrCode=""
        secret=""
        verificationCode=""
        onVerificationCodeChange={noop}
        onVerify={noop}
        onCancel={noop}
        trustDevice={{ checked: false, onCheckedChange }}
      />,
    );
    expect(trustCheckbox()?.getAttribute('aria-checked')).toBe('false');
  });

  it('shows nothing when no trust choice is offered', () => {
    render(
      <MfaTotpEnrollCard
        qrCode=""
        secret=""
        verificationCode=""
        onVerificationCodeChange={noop}
        onVerify={noop}
        onCancel={noop}
      />,
    );
    expect(trustCheckbox()).toBeNull();
  });
});
