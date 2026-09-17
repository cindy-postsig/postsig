import * as React from 'react';
import { Img, Link } from '@react-email/components';
import { EMAIL_ASSET_BASE_URL } from '@/emails/_components/env';

interface EmailLogoProps {
  linked?: boolean;
}

export function EmailLogo({ linked = false }: EmailLogoProps) {
  const img = (
    <Img
      src={`${EMAIL_ASSET_BASE_URL}/PostSig.png`}
      alt="PostSig"
      width="122"
      height="30"
    />
  );

  return linked ? <Link href="https://postsig.com">{img}</Link> : img;
}
