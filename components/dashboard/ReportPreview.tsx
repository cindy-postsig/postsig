import { ReportCard } from '@/components/cards/ReportCard';
import { ContractsTableClient } from '@/components/contracts/ContractsTableClient';
import { reportConfigs } from '@/app/(app)/(cpm)/reports/reportConfigs';
import type { ReportData } from '@/lib/v2/reports/service';
import type { UserMetadata } from '@/constants/types';

interface ReportPreviewProps {
  reportType: keyof typeof reportConfigs;
  data: ReportData;
  columns?: string[];
  viewMoreText?: string;
  customSubheader?: React.ReactNode;
  additionalInfo?: string;
  userMetadata: UserMetadata;
  /** Overrides the default ContractsTableClient body — for a report whose
   * dashboard preview needs different rendering than its own columns list. */
  children?: React.ReactNode;
}

export function ReportPreview({
  reportType,
  data,
  columns,
  viewMoreText,
  customSubheader,
  additionalInfo,
  userMetadata,
  children,
}: ReportPreviewProps) {
  const config = reportConfigs[reportType];
  const defaultColumns = columns || ['vendorAndProduct'];
  const noun = config.noun || { singular: 'contract', plural: 'contracts' };

  if (data.rows.length === 0) {
    return null;
  }

  return (
    <ReportCard
      title={config.title}
      count={data.rows.length}
      viewMoreHref={config.viewMoreHref || `/reports/${reportType}`}
      viewMoreText={
        viewMoreText
          ? viewMoreText
          : data.rows.length <= 5
            ? 'See full report'
            : `See all ${data.rows.length} ${noun.plural}`
      }
      valueLabel={config.valueLabel}
      totalValue={data.totalValueInUSD}
      currency={userMetadata.baseCurrency}
      customSubheader={customSubheader}
      additionalInfo={additionalInfo}
      noun={noun}
    >
      <div>
        {children ?? (
          <ContractsTableClient
            data={data.rows.slice(0, 5) as any}
            columns={defaultColumns}
            hidePagination={true}
            filters={[]}
            userMetadata={userMetadata}
            defaultSortColumn={config.defaultSortColumn || 'termEndDate'}
            defaultSortDirection={config.defaultSortDirection || 'asc'}
            reportType={reportType}
          />
        )}
      </div>
    </ReportCard>
  );
}
