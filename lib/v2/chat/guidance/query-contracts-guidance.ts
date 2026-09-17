export type QueryColumnKey =
  | 'id'
  | 'vendorName'
  | 'contractType'
  | 'cancelByDate'
  | 'termEndDate'
  | 'renewalType'
  | 'tcv'
  | 'currentSpend'
  | 'projectedSpend'
  | 'increase'
  | 'increasePercent';

interface QueryColumnSpec {
  key: QueryColumnKey;
  header: string;
  aliases: readonly string[];
}

export const QUERY_CONTRACTS_COLUMN_SPECS: readonly QueryColumnSpec[] = [
  {
    key: 'id',
    header: 'ID',
    aliases: ['id', 'contractid'],
  },
  {
    key: 'vendorName',
    header: 'Vendor',
    aliases: ['vendor', 'vendorname'],
  },
  {
    key: 'contractType',
    header: 'Type',
    aliases: ['type', 'contracttype'],
  },
  {
    key: 'cancelByDate',
    header: 'Cancel By Date',
    aliases: ['cancelbydate', 'cancelby'],
  },
  {
    key: 'termEndDate',
    header: 'Term End Date',
    aliases: ['termenddate', 'termend'],
  },
  {
    key: 'renewalType',
    header: 'Renewal Type',
    aliases: ['renewaltype', 'renewal'],
  },
  {
    key: 'tcv',
    header: 'TCV',
    aliases: ['tcv', 'totalcontractvalue'],
  },
  {
    key: 'currentSpend',
    header: 'Current Spend',
    aliases: ['currentspend', 'currentbudget', 'currentannualspend'],
  },
  {
    key: 'projectedSpend',
    header: 'Projected Spend',
    aliases: ['projectedspend', 'projectedbudget', 'projectedannualspend'],
  },
  {
    key: 'increase',
    header: 'Increase',
    aliases: ['increase', 'increasepercent'],
  },
  {
    key: 'increasePercent',
    header: 'Increase Percent',
    aliases: ['increasepercent', 'increase'],
  },
] as const;

export const QUERY_CONTRACTS_COLUMN_SPEC_BY_KEY: Record<
  QueryColumnKey,
  QueryColumnSpec
> = {
  id: QUERY_CONTRACTS_COLUMN_SPECS[0],
  vendorName: QUERY_CONTRACTS_COLUMN_SPECS[1],
  contractType: QUERY_CONTRACTS_COLUMN_SPECS[2],
  cancelByDate: QUERY_CONTRACTS_COLUMN_SPECS[3],
  termEndDate: QUERY_CONTRACTS_COLUMN_SPECS[4],
  renewalType: QUERY_CONTRACTS_COLUMN_SPECS[5],
  tcv: QUERY_CONTRACTS_COLUMN_SPECS[6],
  currentSpend: QUERY_CONTRACTS_COLUMN_SPECS[7],
  projectedSpend: QUERY_CONTRACTS_COLUMN_SPECS[8],
  increase: QUERY_CONTRACTS_COLUMN_SPECS[9],
  increasePercent: QUERY_CONTRACTS_COLUMN_SPECS[10],
};

export function getQueryColumnHeader(key: QueryColumnKey): string {
  return QUERY_CONTRACTS_COLUMN_SPEC_BY_KEY[key].header;
}

export function getQueryColumnAliases(key: QueryColumnKey): readonly string[] {
  return QUERY_CONTRACTS_COLUMN_SPEC_BY_KEY[key].aliases;
}

export function buildQueryContractsTableMarkdownHeader(): string {
  return `| ${QUERY_CONTRACTS_COLUMN_SPECS.map(({ header }) => header).join(' | ')} |`;
}
