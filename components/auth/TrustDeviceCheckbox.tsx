'use client';

import { Checkbox } from '@/components/ui/checkbox';
import type { useToast } from '@/components/ui/use-toast';
import { trustDevice } from '@/app/lib/auth/trusted-device-actions';
import { TRUSTED_DEVICE_TTL_DAYS } from '@/constants/security';

export function TrustDeviceCheckbox({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id="trust-device"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        className="mt-0.5"
      />
      <label htmlFor="trust-device" className="text-sm leading-snug">
        Trust this device for {TRUSTED_DEVICE_TTL_DAYS} days
      </label>
    </div>
  );
}

/**
 * After a successful verification: trust the device and say so. A failure
 * is reported and never blocks sign-in — the user is already verified.
 */
export async function trustDeviceAfterVerify(
  toast: ReturnType<typeof useToast>['toast'],
): Promise<void> {
  try {
    // The server action sets the HttpOnly trust cookie itself; the raw token
    // is deliberately never exposed to the client.
    const result = await trustDevice();
    if (result.success) {
      toast({
        title: 'Device Trusted',
        description: `This device will be trusted for ${TRUSTED_DEVICE_TTL_DAYS} days.`,
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Device Trust Failed',
        description: result.error || 'Failed to trust device',
      });
    }
  } catch {
    toast({
      variant: 'destructive',
      title: 'Device Trust Failed',
      description: 'An error occurred while trusting the device',
    });
  }
}
