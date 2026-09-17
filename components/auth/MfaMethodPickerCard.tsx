'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MfaMethodPicker } from '@/components/auth/MfaMethodPicker';
import type { MfaType } from '@/hooks/useMfaEnrollment';

interface MfaMethodPickerCardProps {
  selectedMfaType: MfaType;
  onSelectedMfaTypeChange: (value: MfaType) => void;
  userEmail: string;
  loading?: boolean;
  onStart: () => void;
}

export function MfaMethodPickerCard({
  selectedMfaType,
  onSelectedMfaTypeChange,
  userEmail,
  loading = false,
  onStart,
}: MfaMethodPickerCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Choose preferred MFA method</CardTitle>
        <CardDescription>
          You&apos;ll need this every time you sign in from a new device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <MfaMethodPicker
          value={selectedMfaType}
          onChange={onSelectedMfaTypeChange}
          userEmail={userEmail}
          showRecommendedBadge
        />
        <Button onClick={onStart} disabled={loading} className="h-11 w-full">
          {loading
            ? 'Starting Setup...'
            : `Setup ${selectedMfaType === 'totp' ? 'Authenticator' : 'Email'} MFA`}
        </Button>
      </CardContent>
    </Card>
  );
}
