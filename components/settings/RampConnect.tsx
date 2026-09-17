import IntegrationConnectCard from './IntegrationConnectCard';

function RampIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Ramp"
    >
      <rect width="40" height="40" rx="8" fill="#2C2C2C" />
      <text
        x="50%"
        y="55%"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="white"
        fontSize="14"
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        R
      </text>
    </svg>
  );
}

export default function RampConnect() {
  return (
    <IntegrationConnectCard
      provider="ramp"
      label="Ramp"
      description="Sync Invoices"
      icon={<RampIcon className="h-8 w-8" />}
      connectDialog={{
        eyebrow: 'Secure OAuth via Nango',
        title: 'Connect Ramp',
        description:
          "PostSig is requesting access to your Ramp account to sync bills. You'll be asked to sign in and grant the permissions below.",
        details: [
          'Read bills and invoices',
          'Read vendors and merchant details',
          'Read approval and payment status',
        ],
        primaryActionLabel: 'Continue to Ramp',
      }}
    />
  );
}
