export type FilterType =
  | 'tags'
  | 'renewalType'
  | 'businessSponsor'
  | 'businessGroup';

export interface ReportConfig {
  title: string;
  description?: string;
  fetchOptions: {
    unexecutedOnly?: boolean;
    missingClauses?: boolean;
    contractFields?: string[];
    invoiceReport?: boolean;
    contractTypes?: number[];
  };
  valueLabel?: string;
  valueField?: string;
  valueTransform?: (contract: any) => number;
  customValueDisplay?: boolean;
  columns: string[];
  defaultSortColumn?: string;
  defaultSortDirection?: 'asc' | 'desc';
  filters?: FilterType[];
  viewMoreHref?: string;
  noun?: { singular: string; plural: string };
}

export const defaultReportFilters: FilterType[] = [
  'tags',
  'businessSponsor',
  'businessGroup',
];

const standardColumns = [
  'type',
  'renewalType',
  'termStartDate',
  'cancelByDate',
  'termEndDate',
  'currentBudget',
  'projectedBudget',
  'totalContractValue',
  'businessSponsor',
  'businessGroup',
];

export const reportConfigs: Record<string, ReportConfig> = {
  // Unconfirmed contracts - new report
  unconfirmed: {
    title: 'Unconfirmed Renewals',
    description: 'Contracts that require confirmation',
    fetchOptions: {
      contractFields: ['*'],
    },
    valueLabel: 'worth',
    valueField: 'totalContractValue',
    columns: [
      'select',
      'vendor',
      'orderNumber',
      'product',
      'type',
      'renewalType',
      'termStartDate',
      'cancelByDate',
      'termEndDate',
      'currentBudget',
      'projectedBudget',
      'totalContractValue',
      'status',
      'businessSponsor',
      'businessGroup',
    ],
    defaultSortColumn: 'totalContractValue',
    defaultSortDirection: 'desc',
  },

  // Renewal reports
  'auto-renewals': {
    title: 'Auto-Renewals',
    fetchOptions: {
      contractFields: ['*'],
    },
    valueLabel: 'with a projected annual spend of',
    valueField: 'projectedBudget',
    columns: [
      'expander',
      'vendor',
      'orderNumber',
      'product',
      'type',
      'renewalType',
      'termStartDate',
      'cancelByDate',
      'termEndDate',
      'currentBudget',
      'projectedBudget',
      'businessSponsor',
      'businessGroup',
    ],
    defaultSortColumn: 'cancelByDate',
    defaultSortDirection: 'asc',
    viewMoreHref: '/reports',
  },
  'manual-renewals': {
    title: 'Manual Renewals',
    fetchOptions: {
      contractFields: ['*'],
    },
    valueLabel: 'with a projected annual spend of',
    valueField: 'projectedBudget',
    columns: [
      'expander',
      'vendor',
      'orderNumber',
      'product',
      'type',
      'renewalType',
      'termStartDate',
      'cancelByDate',
      'termEndDate',
      'currentBudget',
      'projectedBudget',
      'businessSponsor',
      'businessGroup',
    ],
    defaultSortColumn: 'cancelByDate',
    defaultSortDirection: 'asc',
  },
  'recently-renewed': {
    title: 'Recently Renewed',
    fetchOptions: {
      contractFields: ['*'],
    },
    valueLabel: 'with a total annual spend of',
    valueField: 'currentBudget',
    columns: [
      'expander',
      'vendor',
      'orderNumber',
      'product',
      'type',
      'renewalType',
      'termStartDate',
      'cancelByDate',
      'termEndDate',
      'currentBudget',
      'businessSponsor',
      'businessGroup',
    ],
    defaultSortColumn: 'termStartDate',
    defaultSortDirection: 'asc',
  },
  'all-renewals': {
    title: 'All Renewals',
    fetchOptions: {
      contractFields: ['*'],
    },
    valueLabel: 'worth',
    valueField: 'totalContractValue',
    columns: [
      'select',
      'vendor',
      'orderNumber',
      'product',
      'type',
      'renewalType',
      'termStartDate',
      'cancelByDate',
      'termEndDate',
      'currentBudget',
      'projectedBudget',
      'businessSponsor',
      'businessGroup',
    ],
    defaultSortColumn: 'termEndDate',
    defaultSortDirection: 'asc',
  },

  // Original reports
  dora: {
    title: 'DORA Analytics',
    fetchOptions: {
      contractFields: ['*'],
    },
    valueLabel: 'worth',
    valueField: 'totalContractValue',
    columns: [
      'select',
      'vendor',
      'orderNumber',
      'product',
      'doraScoreValue',
      'type',
      'renewalType',
      'termStartDate',
      'cancelByDate',
      'termEndDate',
      'currentBudget',
      'projectedBudget',
      'totalContractValue',
      'businessSponsor',
      'businessGroup',
    ],
    defaultSortColumn: 'doraScoreValue',
    defaultSortDirection: 'desc',
  },
  'contract-omissions': {
    title: 'Contract Omissions',
    description:
      'Contracts that are missing important clauses based on contract type',
    fetchOptions: {
      contractFields: ['*'],
    },
    valueLabel: 'worth',
    valueField: 'totalContractValue',
    columns: [
      'vendor',
      'orderNumber',
      'product',
      'missingClausesCount',
      ...standardColumns,
    ],
    defaultSortColumn: 'missingClausesCount',
    defaultSortDirection: 'desc',
  },
  invoices: {
    title: 'Invoice Discrepancies',
    description:
      'Identifies discrepancies between invoices and parent contracts',
    fetchOptions: {
      contractFields: ['*'],
    },
    valueLabel: 'with annualized discrepancies of',
    valueField: 'discrepancy',
    valueTransform: (contract) => Math.abs(contract.discrepancy || 0),
    noun: { singular: 'invoice', plural: 'invoices' },
    columns: [
      'vendor',
      'orderNumber',
      'product',
      'termStartDate',
      'termEndDate',
      'expectedInvoiceAmount',
      'invoiceAmount',
      'discrepancy',
      'difference',
      'frequencyMismatch',
      'invoiceStatus',
      'businessSponsor',
      'businessGroup',
    ],
    defaultSortColumn: 'difference',
    defaultSortDirection: 'desc',
  },
  utilization: {
    title: 'Contract Utilization',
    description: 'Identifies under and over utilized software licenses',
    fetchOptions: {
      contractFields: ['*'],
    },
    valueLabel: 'with potential overages of',
    valueField: 'potentialOverage',

    columns: [
      'vendor',
      'orderNumber',
      'product',
      'seatUsageDisplay',
      'utilizationPercentage',
      'pricePerSeat',
      'potentialOverage',
      'renewalType',
      'termStartDate',
      'cancelByDate',
      'termEndDate',
      'addUsers',
      'businessSponsor',
      'businessGroup',
    ],
    defaultSortColumn: 'potentialOverage',
    defaultSortDirection: 'desc',
  },
  unexecuted: {
    title: 'Unexecuted Contracts',
    description: 'Contracts that have not been fully executed',
    fetchOptions: {},
    valueLabel: 'worth',
    valueField: 'totalContractValue',
    columns: [
      'vendor',
      'orderNumber',
      'product',
      ...standardColumns,
      'uploadExecuted',
    ],
    defaultSortColumn: 'totalContractValue',
    defaultSortDirection: 'desc',
  },
  nda: {
    title: 'NDA Insights',
    description:
      'Identifying potential risks in your non-disclosure agreements',
    fetchOptions: {
      contractTypes: [8],
    },
    columns: [
      'vendor',
      'orderNumber',
      'termStartDate',
      'cancelByDate',
      'termEndDate',
      'extendedTermEndDate',
      'ndaRiskLevel',
      'identifiedRisks',
      'businessSponsor',
      'businessGroup',
    ],
    defaultSortColumn: 'ndaRiskLevel',
    defaultSortDirection: 'desc',
  },
  trial: {
    title: 'Trial Agreements',
    description: 'Contracts currently in trial period',
    fetchOptions: {
      contractTypes: [7],
    },
    customValueDisplay: true,
    noun: { singular: 'trial', plural: 'trials' },
    columns: [
      'vendor',
      'orderNumber',
      'product',
      'daysRemaining',
      'termEndDate',
      'businessSponsor',
      'businessGroup',
    ],
    defaultSortColumn: 'daysRemaining',
    defaultSortDirection: 'asc',
  },
  leavers: {
    title: 'Employee Departures (Leavers)',
    description:
      'Contracts with seats allocated to employees who have left the organization',
    fetchOptions: {
      contractFields: ['*'],
    },
    customValueDisplay: true,
    valueField: 'departedLicensesCount',
    columns: [
      'vendor',
      'orderNumber',
      'product',
      'departedLicensesCount',
      'seatUsageDisplay',
      'businessSponsor',
      'businessGroup',
      'reAllocateSeats',
    ],
    defaultSortColumn: 'departedLicensesCount',
    defaultSortDirection: 'desc',
  },
};
