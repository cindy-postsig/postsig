import * as React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export const TOTP_FAILED_MESSAGE =
  "If you've lost access to your authenticator, you can reset your password instead.";

export const EMAIL_FAILED_MESSAGE =
  "Double-check the code in your inbox. Request a new code if it's expired.";

interface FailedAttemptsAlertProps {
  message: React.ReactNode;
}

export function FailedAttemptsAlert({ message }: FailedAttemptsAlertProps) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Multiple Failed Attempts</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
