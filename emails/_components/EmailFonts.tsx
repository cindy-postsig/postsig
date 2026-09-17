import * as React from 'react';
import { Font } from '@react-email/components';
import { EMAIL_ASSET_BASE_URL } from '@/emails/_components/env';

export function EmailFonts() {
  return (
    <>
      <Font
        fontFamily="FK Grotesk"
        fallbackFontFamily="sans-serif"
        webFont={{
          url: `${EMAIL_ASSET_BASE_URL}/fonts/FKGrotesk-Regular.woff2`,
          format: 'woff2',
        }}
        fontWeight={400}
        fontStyle="normal"
      />
      <Font
        fontFamily="FK Grotesk"
        fallbackFontFamily="sans-serif"
        webFont={{
          url: `${EMAIL_ASSET_BASE_URL}/fonts/FKGrotesk-Medium.woff2`,
          format: 'woff2',
        }}
        fontWeight={500}
        fontStyle="normal"
      />
      <Font
        fontFamily="FK Grotesk"
        fallbackFontFamily="sans-serif"
        webFont={{
          url: `${EMAIL_ASSET_BASE_URL}/fonts/FKGrotesk-Bold.woff2`,
          format: 'woff2',
        }}
        fontWeight={700}
        fontStyle="normal"
      />
    </>
  );
}
