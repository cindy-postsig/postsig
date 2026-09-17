import * as React from 'react';
import { Hr } from '@react-email/components';
import { Text } from '@/emails/_components/EmailText';

interface EmailFooterProps {
  automated?: boolean;
}

export function EmailFooter({ automated }: EmailFooterProps) {
  return (
    <>
      <Hr style={{ marginTop: '40px', marginBottom: '20px' }} />
      {automated && (
        <Text className="mb-0 text-[13px] text-neutral-500">
          Automated alert from PostSig. Please do not reply to this email.
        </Text>
      )}
      <Text
        className={
          automated
            ? 'mb-0 mt-2 text-[13px] text-neutral-500'
            : 'mb-0 text-[13px] text-neutral-500'
        }
      >
        Copyright © {new Date().getFullYear()} Postsig, Inc. All rights
        reserved.
      </Text>
    </>
  );
}
