'use client';

import { useState, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Copy, Download, Key, RefreshCw } from 'lucide-react';
import { generateBackupCodes } from '@/app/lib/auth/mfa-actions';

interface BackupCodesProps {
  user: User;
  hasBackupCodes: boolean;
}

export default function BackupCodes({
  user,
  hasBackupCodes,
}: BackupCodesProps) {
  const [loading, setLoading] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [showCodes, setShowCodes] = useState(false);
  const { toast } = useToast();

  const handleGenerateCodes = useCallback(async () => {
    const confirmed = hasBackupCodes
      ? window.confirm(
          'Generating new backup codes will invalidate your existing codes. Are you sure you want to continue?',
        )
      : true;

    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await generateBackupCodes();

      if (!result.success) {
        toast({
          variant: 'destructive',
          title: 'Failed to Generate Backup Codes',
          description: result.error || 'Please try again.',
        });
        return;
      }

      if (result.codes) {
        setBackupCodes(result.codes);
        setShowCodes(true);

        toast({
          title: 'Backup Codes Generated',
          description:
            "Please save these codes in a secure location. You won't be able to see them again.",
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to generate backup codes. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [hasBackupCodes, toast]);

  const handleCopyCodes = useCallback(() => {
    if (!backupCodes) return;

    const codesText = backupCodes.join('\n');
    navigator.clipboard
      .writeText(codesText)
      .then(() => {
        toast({
          title: 'Copied to Clipboard',
          description: 'Backup codes have been copied to your clipboard.',
        });
      })
      .catch(() => {
        toast({
          variant: 'destructive',
          title: 'Copy Failed',
          description:
            'Failed to copy codes to clipboard. Please copy them manually.',
        });
      });
  }, [backupCodes, toast]);

  const handleDownloadCodes = useCallback(() => {
    if (!backupCodes) return;

    const codesText = [
      'PostSig MFA Backup Codes',
      '========================',
      '',
      'These are your backup codes for multi-factor authentication.',
      'Each code can only be used once. Store them in a secure location.',
      '',
      'Generated: ' + new Date().toLocaleString(),
      '',
      ...backupCodes.map((code, index) => `${index + 1}. ${code}`),
    ].join('\n');

    const blob = new Blob([codesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'postsig-mfa-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: 'Backup Codes Downloaded',
      description: 'Your backup codes have been saved as a text file.',
    });
  }, [backupCodes, toast]);

  const handleCodesAcknowledged = () => {
    setShowCodes(false);
    setBackupCodes(null);

    // Refresh the page to show updated status
    window.location.reload();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5 text-muted-foreground" />
          Backup Codes
          {hasBackupCodes && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              Generated
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Recovery codes you can use to access your account if you lose your
          authenticator device.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!showCodes && (
          <>
            {!hasBackupCodes && (
              <div className="border-yellow-200 bg-yellow-50 flex items-start gap-3 rounded-lg border p-4">
                <AlertTriangle className="text-yellow-600 mt-0.5 h-5 w-5" />
                <div className="space-y-1">
                  <p className="text-yellow-800 font-medium text-sm">
                    Generate Backup Codes
                  </p>
                  <p className="text-yellow-700 text-sm">
                    Create backup codes to ensure you can access your account if
                    you lose your authenticator device.
                  </p>
                </div>
              </div>
            )}

            {hasBackupCodes && (
              <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <Key className="mt-0.5 h-5 w-5 text-blue-600" />
                <div className="space-y-1">
                  <p className="font-medium text-sm text-blue-800">
                    Backup Codes Available
                  </p>
                  <p className="text-sm text-blue-950">
                    You have backup codes generated for emergency access.
                    Generate new codes if you&apos;ve lost them or suspect
                    they&apos;ve been compromised.
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleGenerateCodes} disabled={loading}>
                {loading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>{hasBackupCodes ? 'Regenerate' : 'Generate'} Backup Codes</>
                )}
              </Button>
            </div>
          </>
        )}

        {showCodes && backupCodes && (
          <div className="space-y-6">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
                <div className="space-y-1">
                  <p className="font-medium text-sm text-red-800">
                    Important: Save These Codes Securely
                  </p>
                  <p className="text-sm text-red-700">
                    This is the only time you&apos;ll see these codes. Save them
                    somewhere secure like a password manager. Each code can only
                    be used once.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-4">
                <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                  {backupCodes.map((code, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded border bg-white p-2"
                    >
                      <span className="font-medium text-muted-foreground">
                        {index + 1}.
                      </span>
                      <span className="font-mono tracking-wider">{code}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCopyCodes}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy All
                </Button>
                <Button variant="outline" onClick={handleDownloadCodes}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="mb-3 text-sm text-muted-foreground">
                I have saved these backup codes in a secure location.
              </p>
              <Button onClick={handleCodesAcknowledged}>
                I&apos;ve Saved My Backup Codes
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
