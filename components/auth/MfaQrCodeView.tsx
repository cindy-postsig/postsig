'use client';

import * as React from 'react';

interface MfaQrCodeViewProps {
  qrCode: string;
  secret: string;
}

export function MfaQrCodeView({ qrCode, secret }: MfaQrCodeViewProps) {
  return (
    <div className="space-y-4">
      <div className="rounded border bg-white p-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrCode.trimEnd()}
          alt="MFA QR Code"
          className="mx-auto h-48 w-48"
          width={192}
          height={192}
        />
        <p className="mt-2 text-sm text-muted-foreground">
          Scan this QR code with your authenticator app
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm">Can&apos;t scan the QR code?</p>
        <div className="flex items-center gap-4 rounded bg-muted p-2">
          <div className="border-r border-r-foreground/20 pr-3 font-mono text-xs">
            Secret Key
          </div>
          <p className="break-all rounded font-mono text-xs text-muted-foreground">
            {secret}
          </p>
        </div>
      </div>
    </div>
  );
}
