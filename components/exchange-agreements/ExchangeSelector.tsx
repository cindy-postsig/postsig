import { cn } from '@/lib/utils';
import SidebarDropdown, { SidebarRadioDot } from './SidebarDropdown';
import type { ExchangeSummary } from '@/lib/exchange-agreement/types';

interface Props {
  exchanges: ExchangeSummary[];
  value: string | null;
  onChange: (code: string) => void;
}

export default function ExchangeSelector({
  exchanges,
  value,
  onChange,
}: Props) {
  const currentName = exchanges.find(
    (exchange) => exchange.code === value,
  )?.name;

  return (
    <SidebarDropdown
      label="Exchange"
      displayValue={
        <span
          className={cn(
            'font-medium text-base',
            currentName ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {currentName ?? 'Select exchange'}
        </span>
      }
    >
      {exchanges.map((exchange) => {
        const selected = exchange.code === value;
        const hasData = exchange.productLineCount > 0;
        return (
          <button
            key={exchange.code}
            type="button"
            disabled={!hasData}
            className="flex w-full items-start justify-between gap-3 px-4 py-2 text-left text-sm text-foreground hover:bg-hover disabled:cursor-not-allowed disabled:hover:bg-transparent"
            onClick={() => onChange(exchange.code)}
          >
            <span className="flex items-start gap-3">
              <SidebarRadioDot selected={selected} muted={!hasData} />
              <span className={cn(!hasData && 'text-muted-foreground')}>
                {exchange.name}
              </span>
            </span>
            {!hasData && (
              <span className="text-xs text-muted-foreground">No data</span>
            )}
          </button>
        );
      })}
    </SidebarDropdown>
  );
}
