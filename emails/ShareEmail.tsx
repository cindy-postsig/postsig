import * as React from 'react';
import { AppLayout } from '@/emails/_components/AppLayout';

interface EmailTemplateProps {
  user: any;
  termTitle: string;
  term: string;
  message: string;
}

export const ShareEmailTemplate: React.FC<Readonly<EmailTemplateProps>> & {
  PreviewProps?: EmailTemplateProps;
} = ({ user, termTitle, term, message }) => (
  <AppLayout>
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid rgba(0,0,0,.05)',
        padding: '30px',
        marginBottom: '30px',
        marginTop: '30px',
      }}
    >
      <strong style={{ fontSize: '16px' }}>{user}</strong>
      <div style={{ fontSize: '16px' }}> {message}</div>
    </div>
    <div
      style={{
        backgroundColor: '#f5f5f6',
        borderRadius: '8px',
        border: '1px solid rgba(0,0,0,.15)',
        padding: '30px',
        marginBottom: '30px',
      }}
    >
      <strong
        style={{
          textTransform: 'uppercase',
          fontSize: '14px',
          letterSpacing: '.25px',
          paddingBottom: '5px',
        }}
      >
        {termTitle}
      </strong>
      <div style={{ fontSize: '18px', fontFamily: 'serif' }}>{term}</div>
    </div>
  </AppLayout>
);

ShareEmailTemplate.PreviewProps = {
  user: 'Andy Funk',
  termTitle: 'Auto-renewal clause',
  term: 'This Agreement shall automatically renew for successive one-year terms unless either party provides written notice of non-renewal at least sixty (60) days prior to the expiration of the then-current term.',
  message:
    'Sharing this auto-renewal clause for review — let me know if we should push back on the 60-day notice window.',
};

export default ShareEmailTemplate;
