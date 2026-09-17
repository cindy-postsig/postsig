import { DocuSignIcon } from '@/components/icons/DocuSignIcon';
import type { IntegrationProvider } from '@/lib/v2/integrations/catalog';

export function ProviderIcon({
  provider,
  className,
}: {
  provider: IntegrationProvider;
  className?: string;
}) {
  if (provider === 'docusign') {
    return <DocuSignIcon className={className ?? 'w-8'} />;
  }

  if (provider === 'xero') {
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

export function ProviderIconTile({
  provider,
}: {
  provider: IntegrationProvider;
}) {
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-border bg-secondary/20">
      <ProviderIcon provider={provider} className="h-8 w-8" />
    </div>
  );
}
