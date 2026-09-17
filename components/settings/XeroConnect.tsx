import IntegrationConnectCard from './IntegrationConnectCard';

function XeroIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Xero"
    >
      <circle cx="20" cy="20" r="16" fill="#13B5EA" />
      <text
        x="50%"
        y="52%"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="white"
        fontSize="8"
        fontWeight="600"
        fontFamily="sans-serif"
      >
        xero
      </text>
    </svg>
  );
}

export default function XeroConnect() {
  return (
    <IntegrationConnectCard
      provider="xero"
      label="Xero"
      description="Sync Invoices"
      icon={<XeroIcon className="h-8 w-8" />}
      connectDialog={{
        eyebrow: 'Secure OAuth via Nango',
        title: 'Connect Xero',
        description:
          "PostSig is requesting access to your Xero account to sync invoices. You'll be asked to sign in and grant the permissions below.",
        details: [
          'Read invoices and bills',
          'Read contacts & organisation profile',
          'Read payment status',
        ],
        primaryActionLabel: 'Continue to Xero',
      }}
    />
  );
}
