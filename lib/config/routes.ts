export const APP_ROUTES = {
  DASHBOARD: '/dashboard',
  CONTRACTS: '/contracts',
  CONTRACT_BY_ID: '/contracts/:id',
  VENDORS: '/vendors',
  VENDOR_BY_ID: '/vendors/:id',
  CALENDAR: '/calendar',
  BUDGET: '/budget',
  REPORTS: '/reports',
  REPORTS_INVOICES: '/reports/invoices',
  REPORTS_UTILIZATION: '/reports/utilization',
  REPORTS_UNCONFIRMED: '/reports/unconfirmed',
  REPORTS_CONTRACT_OMISSIONS: '/reports/contract-omissions',
  REPORTS_DORA: '/reports/dora',
  REPORTS_UNEXECUTED: '/reports/unexecuted',
  REPORTS_NDA: '/reports/nda',
  REPORTS_TRIAL_AGREEMENTS: '/reports/trial',
} as const;

export type AppRoutePath = (typeof APP_ROUTES)[keyof typeof APP_ROUTES];

export const PREDEFINED_CHATBOT_ROUTES: AppRoutePath[] = [
  APP_ROUTES.DASHBOARD,
  APP_ROUTES.CONTRACTS,
  APP_ROUTES.VENDORS,
  APP_ROUTES.CALENDAR,
  APP_ROUTES.BUDGET,
  APP_ROUTES.REPORTS,
  APP_ROUTES.REPORTS_INVOICES,
  APP_ROUTES.REPORTS_UTILIZATION,
  APP_ROUTES.REPORTS_UNCONFIRMED,
  APP_ROUTES.REPORTS_CONTRACT_OMISSIONS,
  APP_ROUTES.REPORTS_DORA,
  APP_ROUTES.REPORTS_UNEXECUTED,
  APP_ROUTES.REPORTS_NDA,
  APP_ROUTES.REPORTS_TRIAL_AGREEMENTS,
];

export const ROUTE_DEFINITIONS: { path: AppRoutePath; description: string }[] =
  [
    {
      path: APP_ROUTES.DASHBOARD,
      description:
        'Overview of contract activity, key metrics, and upcoming deadlines',
    },
    {
      path: APP_ROUTES.CONTRACTS,
      description:
        'Manage all contracts: view, edit, track status, and access AI-driven insights',
    },
    {
      path: APP_ROUTES.CALENDAR,
      description:
        'Track key contract dates, milestones, renewal, and termination deadlines',
    },
    {
      path: APP_ROUTES.BUDGET,
      description:
        'Manage contract-related budgets, track expenditures, and forecast spending',
    },
    {
      path: APP_ROUTES.REPORTS,
      description: 'Generate and view reports on renewals',
    },
    {
      path: APP_ROUTES.REPORTS_INVOICES,
      description:
        'Generate and view reports on contract invoices, payments, and financial data',
    },
    {
      path: APP_ROUTES.REPORTS_UTILIZATION,
      description:
        'Analyze vendor utilization rates, contract compliance, and performance metrics',
    },
    {
      path: APP_ROUTES.REPORTS_UNCONFIRMED,
      description:
        'Identify and track contracts that are not confirmed or have pending actions',
    },
    {
      path: APP_ROUTES.REPORTS_CONTRACT_OMISSIONS,
      description:
        'Identify contracts with missing clauses, data gaps, or incomplete information',
    },
    {
      path: APP_ROUTES.REPORTS_DORA,
      description:
        'Review DORA compliance scores and identify non-compliant contracts',
    },
    {
      path: APP_ROUTES.REPORTS_UNEXECUTED,
      description:
        'Track unsigned or unexecuted contracts pending final signatures',
    },
    {
      path: APP_ROUTES.REPORTS_NDA,
      description: 'Review NDA contracts and identify non-compliant contracts',
    },
    {
      path: APP_ROUTES.REPORTS_TRIAL_AGREEMENTS,
      description:
        'Review trial agreements and identify contracts that are still in trial period',
    },
    {
      path: APP_ROUTES.CONTRACT_BY_ID,
      description:
        "View details of a specific contract. Replace ':id' with the actual contract ID (e.g., /contracts/123).",
    },
    {
      path: APP_ROUTES.VENDOR_BY_ID,
      description:
        "View details of a specific vendor. Replace ':id' with the actual vendor ID (e.g., /vendors/123).",
    },
  ];
