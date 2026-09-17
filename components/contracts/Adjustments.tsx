import { InfoCircledIcon } from '@radix-ui/react-icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import CitationField from './CitationField';
import { Citation } from '@/constants/types';

type AdjustmentsProps = {
  data: any;
  citations?: Citation[];
};

export default function Adjustments({
  data,
  citations = [],
}: AdjustmentsProps) {
  const adjustments = [];

  // Helper function to find citation by field ID
  const findCitation = (fieldId: string) => {
    return citations.find((citation) => citation.id === fieldId);
  };

  if (data.discount) {
    adjustments.push({
      id: 'discount',
      type: 'Discount',
      value: data.discount,
      tooltip: 'The discount applied to the total cost.',
      citation: findCitation('discount'),
    });
  }

  if (data.annual_increase) {
    adjustments.push({
      id: 'annual_increase',
      type: 'Percentage Increase Per Period',
      value: data.annual_increase,
      tooltip: 'The increase applied upon renewal.',
      citation: findCitation('annual_increase'),
    });
  }

  if (data.annual_increase && data.annual_increase_months) {
    adjustments.push({
      id: 'annual_increase_months',
      type: 'Period Interval',
      value: data.annual_increase_months,
      prefix: 'Every',
      suffix: 'months',
      indent: 1,
      tooltip: 'How often the increase is applied.',
      citation: findCitation('annual_increase_months'),
    });
  }

  const cpiValue =
    data.other_attributes?.increase?.cpi || data.other_attributes?.cpi;
  if (cpiValue === 'Yes' || cpiValue === 'No') {
    adjustments.push({
      id: 'cpi',
      type: 'Consumer Price Index (CPI) Increase',
      value: cpiValue,
      tooltip: 'Annual increase may be affected by CPI at time of renewal.',
      citation: findCitation('cpi'),
    });
  }

  if (adjustments.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 mt-8 flex border-t">
      <div className="flex w-1/4 justify-between px-1">
        <p className="pt-2 font-label text-[.825rem] uppercase tracking-wide text-foreground/85">
          Adjustments
        </p>
      </div>
      <div className="w-3/4">
        {adjustments.map((adjustment) => (
          <div
            key={adjustment.type}
            className={`flex h-10 items-center justify-between gap-2 border-b border-dashed px-1 py-[.35rem] leading-snug tracking-[0.02rem]
              ${adjustment.indent ? `pl-${adjustment.indent * 4} text-[0.85rem]` : 'text-[0.9rem]'}`}
          >
            <div>
              <CitationField citation={adjustment.citation}>
                <span>
                  {adjustment.type + ' '}
                  {adjustment.tooltip && (
                    <TooltipProvider>
                      <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                          <InfoCircledIcon className="inline" />
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>{adjustment.tooltip}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </span>
              </CitationField>
            </div>
            <div className="font-label">
              {adjustment.id === 'annual_increase' ||
              adjustment.id === 'discount' ? (
                <div
                  className={`min-w-12 rounded-sm bg-opacity-10 px-2 py-1 text-center text-sm ${
                    adjustment.id === 'discount' || adjustment.value <= 0
                      ? 'bg-[#00A86B] text-[#00A86B]'
                      : 'bg-[#B90C41] text-[#B90C41]'
                  }`}
                >
                  {adjustment.id === 'discount' ? '-' : '+'}
                  {adjustment.value ? adjustment.value : '0'}%
                </div>
              ) : (
                <div className="px-2 text-sm">
                  {adjustment.prefix && `${adjustment.prefix} `}
                  {adjustment.value}
                  {adjustment.suffix && ` ${adjustment.suffix}`}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
