'use client';

import type { NdaRiskContract } from '@/lib/v2/chat/client';
import {
  createBaseContractColumns,
  ResultsTable,
  type BaseQueryContractsRow,
  type ColumnConfig,
} from '../shared';

interface NdaRiskRow extends BaseQueryContractsRow {
  riskLevel: string;
  risks: string;
}

const RISK_COLORS: Record<string, string> = {
  '1': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  '2': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  '3': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const columns: ColumnConfig<NdaRiskRow>[] = [
  ...createBaseContractColumns<NdaRiskRow>(),
  {
    key: 'riskLevel',
    header: 'Risk',
    render: (value) => {
      const level = value as string;
      return (
        <span className={`rounded px-1.5 py-0.5 ${RISK_COLORS[level] ?? ''}`}>
          Level {level}
        </span>
      );
    },
    exportFormat: (value) => String(value),
  },
  {
    key: 'risks',
    header: 'Risk Factors',
    className: 'max-w-[300px] whitespace-normal align-top',
    render: (value) => (
      <span className="block text-sm leading-5">
        {(value as string) || '—'}
      </span>
    ),
    exportFormat: (value) => String(value),
  },
];

export function NdaRiskSummary({ data }: { data: NdaRiskContract[] }) {
  const rows: NdaRiskRow[] = data.map((c) => ({
    contractId: c.id,
    vendorName: c.vendor ?? 'Unknown Vendor',
    contractType: 'NDA',
    riskLevel: String(c.riskLevel),
    risks: c.risks.join(', '),
  }));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {data.length} NDA{data.length !== 1 ? 's' : ''} with elevated risk
      </p>
      <ResultsTable rows={rows} columns={columns} />
    </div>
  );
}
