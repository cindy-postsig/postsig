import * as React from 'react';
import { Section } from '@react-email/components';
import { AppLayout } from '@/emails/_components/AppLayout';
import { CTAButton } from '@/emails/_components/CTAButton';
import { APP_BASE_URL } from '@/emails/_components/env';
import { sanitizeAndStyleComment } from '@/emails/utils';

interface EmailTemplateProps {
  user: string;
  comment: string;
  contract: any;
  type: 'mention' | 'reply';
}

export const CommentEmailTemplate: React.FC<Readonly<EmailTemplateProps>> & {
  PreviewProps?: EmailTemplateProps;
} = ({ user, comment, contract, type }) => (
  <AppLayout maxWidth={800}>
    <div
      style={{
        marginBottom: '10px',
        marginTop: '50px',
      }}
    >
      <strong style={{ fontSize: '14px' }}>{user}</strong>{' '}
      <span style={{ fontSize: '14px' }}>
        {type === 'mention'
          ? 'mentioned you in a comment'
          : 'replied to your comment'}
      </span>
    </div>
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '4px',
        border: '1px solid rgba(0,0,0,.05)',
        paddingTop: '15px',
        paddingBottom: '20px',
        paddingRight: '20px',
        paddingLeft: '20px',
      }}
    >
      <div
        style={{
          paddingBottom: '15px',
          marginBottom: '20px',
          borderBottom: '1px solid rgba(0,0,0,.15)',
        }}
      >
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
          {contract.vendors.name}
        </div>

        {contract.vendor_products_details?.length > 0 && (
          <div style={{ fontSize: '13px' }}>
            {contract.vendor_products_details[0].vendor_products.name}{' '}
            {contract.vendor_products_details.length > 1 &&
              `and ${contract.vendor_products_details.length - 1} other products`}
          </div>
        )}
      </div>
      <div
        style={{ fontSize: '15px' }}
        dangerouslySetInnerHTML={{ __html: sanitizeAndStyleComment(comment) }}
      />
    </div>
    <Section className="mb-12">
      <CTAButton href={`${APP_BASE_URL}/contracts/${contract.id}`} size="sm">
        Reply
      </CTAButton>
    </Section>
  </AppLayout>
);

CommentEmailTemplate.PreviewProps = {
  user: 'Sample User',
  type: 'mention',
  comment:
    'Hey <span style="display: inline-flex; align-items: center; border-radius: 9999px; padding: 2px 10px; font-size: 15px; font-weight: 500; margin-right: 4px; background-color: #3A2FA915; color: #3A2FA9;">@Teammate</span> — can you take a look at section 3.2? The auto-renewal language differs from what we discussed.',
  contract: {
    id: 12345,
    vendors: { name: 'Acme Corp' },
    vendor_products_details: [
      { vendor_products: { name: 'Acme Pro Plan' } },
      { vendor_products: { name: 'Acme API Access' } },
    ],
  },
};

export default CommentEmailTemplate;
