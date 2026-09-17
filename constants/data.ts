import {
  contractTypes,
  isExchangeAgreementType,
  isInvoiceType,
} from '@/app/lib/constants';

export const userRoles = {
  postsigSuperAdmin: 1,
  postsigAdmin: 2,
  postsigUser: 3,
  postsigDeveloper: 4,
  postsigQA: 5,
  postsigReviewer: 6,
  postsigExtractor: 7,
  clientAdmin: 11,
  clientSupervisor: 12,
  clientReviewer: 13,
  clientUser: 14,
  clientTrialUser: 15,
};

export const ITEMS_PER_PAGE = 50;

export const acceptedUserRoles = [
  userRoles.postsigExtractor,
  userRoles.postsigUser,
  userRoles.clientUser,
  userRoles.clientAdmin,
  userRoles.clientSupervisor,
  userRoles.clientTrialUser,
  userRoles.postsigAdmin,
  userRoles.postsigSuperAdmin,
  userRoles.postsigReviewer,
];

// Modules served by this app. Grants for other apps (e.g. portco) may exist in
// user_module_access but must never drive routing here.
export const APP_MODULE_CODES = ['cpm', 'investor'];

export const extractionRoles = [
  userRoles.postsigExtractor,
  userRoles.postsigReviewer,
];

export const postsigAdminRoles = [
  userRoles.postsigAdmin,
  userRoles.postsigSuperAdmin,
];

export const clientAdminRoles = [userRoles.clientSupervisor];

export const assetClasses = [
  {
    name: 'Equities',
    subClasses: [
      'ETFs',
      'ADRs',
      'Common Stocks',
      'Preferred Stocks',
      'Exchange-Traded Funds',
      'American Depository Receipts',
      'Warrants and Rights',
    ],
  },
  {
    name: 'Fixed Income',
    subClasses: [
      'Convertible Bonds',
      'TIPS',
      'Treasury Inflation Protected Securities',
      'ABS',
      'Asset Backed Securities',
      'MBS',
      'Mortgage Backed Securities',
      'Supranationals',
      'Sovereign Debt',
      'Municipal Bonds',
      'Corporate Bonds',
      'Eurobonds',
      'U.S. Treasuries',
      'Government Bonds',
    ],
  },
  {
    name: 'Derivatives',
    subClasses: [
      'CFDs',
      'Contracts for Difference',
      'Commodity Forwards',
      'Currency Forwards',
      'Forwards',
      'CDS',
      'Credit Default Swaps',
      'Interest Rate Swaps',
      'Swaps',
      'Financial Futures',
      'Commodity Futures',
      'Futures',
      'Interest Rate Options',
      'FX Options',
      'Index Options',
      'Equity Options',
      'Equities Options',
    ],
  },
  {
    name: 'Foreign Exchange',
    subClasses: ['Currency Swaps', 'FX Options', 'FX Forwards', 'Spot FX'],
  },
  {
    name: 'Commodities',
    subClasses: [
      'Sugar',
      'Cotton',
      'Coffee',
      'Soft Commodities',
      'Hogs',
      'Cattle',
      'Livestock',
      'Frozen Concentrated Orange Juice',
      'FCOJ',
      'Soybeans',
      'Corn',
      'Wheat',
      'Agricultural Commodities',
      'Aluminum',
      'Copper',
      'Industrial Metals',
      'Palladium',
      'Platinum',
      'Silver',
      'Gold',
      'Precious Metals',
      'Natural Gas',
      'Oil',
      'Energy',
    ],
  },
  {
    name: 'Real Estate',
    subClasses: [
      'Residential Real Estate',
      'Commercial Real Estate',
      'REIT',
      'Real Estate Investment Trusts',
    ],
  },
  {
    name: 'Money Market Instruments',
    subClasses: [
      'Repos',
      'Repurchase Agreements',
      'CD',
      'Certificates of Deposit',
      'Commercial Paper',
      'T-Bills',
      'Treasury Bills',
    ],
  },
  {
    name: 'Mutual Funds and Collective Investment Schemes',
    subClasses: [
      'UIT',
      'Unit Investment Trusts',
      'Hedge Funds',
      'Closed-End Funds',
      'Open-End Mutual Funds',
    ],
  },
  {
    name: 'Indices',
    subClasses: [
      'VIX',
      'Volatility Indices',
      'CRB Index',
      'Commodity Indices',
      'Bond Market Indices',
      'Equity Market Indices',
    ],
  },
  {
    name: 'Alternative Investments',
    subClasses: [
      'Collectibles',
      'Wine',
      'Art',
      'Infrastructure Funds',
      'Hedge Funds',
      'Venture Capital',
      'Private Equity',
    ],
  },
  {
    name: 'Cryptocurrencies and Digital Assets',
    subClasses: [
      'NFT',
      'Non-fungible Tokens',
      'Stablecoins',
      'Litecoin',
      'Altcoins',
      'ETH',
      'Ethereum',
      'BTC',
      'Bitcoin',
    ],
  },
  {
    name: 'Credit Instruments',
    subClasses: ['Structured Notes', 'CLO', 'Collateralized Loan Obligations'],
  },
  {
    name: 'Insurance Products',
    subClasses: ['Catastrophe Bonds', 'Annuities', 'Life Insurance Contracts'],
  },
  {
    name: 'ESG/Sustainability',
    subClasses: [],
  },
];

export const extractionFields = {
  dateFields: {
    term_start_date: 'term_start_date',
    cancel_by_date: 'cancel_by_date',
    execution_date: 'execution_date',
  },
  invoice: {
    due_date: 'due_date',
    term_end_date: 'term_end_date',
    sales_tax: 'sales_tax',
    credits_list: 'credits_list',
  },
  nda: {
    purpose: 'purpose',
    confidential_information: 'confidential_information',
    non_use_non_disclosure: 'non_use_non_disclosure',
    maintenance_of_confidentiality: 'maintenance_of_confidentiality',
    term_termination: 'term_termination',
    no_obligation: 'no_obligation',
    no_license_ownership: 'no_license_ownership',
    remedies: 'remedies',
    permitted_use: 'permitted_use',
    no_warranty: 'no_warranty',
    miscellaneous: 'miscellaneous',
    exclusions_exceptions: 'exclusions_exceptions',
    disclosure_required_by_law: 'disclosure_required_by_law',
    non_solicitation_of_employees: 'non_solicitation_of_employees',
    mutual_nda: 'mutual_nda',
    extended_confidentiality_period: 'extended_confidentiality_period',
    perpetual_nda: 'perpetual_nda',
    unilateral_nda: 'unilateral_nda',
    uncapped_liability: 'uncapped_liability',
    post_end_of_term_obligations: 'post_end_of_term_obligations',
    foreign_jurisdiction: 'foreign_jurisdiction',
    no_carve_out_provisions: 'no_carve_out_provisions',
    non_solicitation: 'non_solicitation',
  },
  general: {
    subscriptionTerm: 'subscription_term',
    billingFrequency: 'billing_frequency',
    paymentTerms: 'payment_terms',
    dataDisposalTnc: 'data_disposal_tnc',
    auditRequirements: 'audit_requirements',
    annualIncrease: 'annual_increase',
    discount: 'discount',
    currency: 'currency',
    cancellationProcess: 'cancellation_process',
    distributionRights: 'distribution_rights',
    endUsers: 'end_users',
    numberOfUsers: 'number_of_users',
    marketDataTypes: 'market_data_types',
    internalExternalUsers: 'internal_external_users',
    derivativeWorks: 'derivative_works',
    activities: 'activities',
    geoRestrictions: 'geo_restrictions',
    exclusivityTerms: 'exclusivity_terms',
    marketingRights: 'marketing_rights',
    renewalPeriod: 'renewal_period',
    suspensionOfService: 'suspension_of_service',
    autoRenewal: 'auto_renewal',
    multiYear: 'multi_year',
    tosUrls: 'tos_urls',
    tryingToUpdateAnotherDoc: 'trying_to_update_another_doc',
    allPartiesSigned: 'all_parties_signed',
    requiredSignatureCount: 'required_signature_count',
    dateOfLastSignature: 'date_of_last_signature',
    aiTrainingRestrictions: 'ai_training_restrictions',
    productsList: 'products_list',
    dataDeliveryMethods: 'data_delivery_methods',
    cpi: 'cpi',
    orderNumber: 'order_number',
  },
  dora: {
    serviceLevelAgreements: 'service_level_agreements',
    costMitigation: 'cost_mitigation',
    arbitrationAndConflictResolution: 'arbitration_and_conflict_resolution',
    securityAwareness: 'security_awareness',
  },
  addendum: {
    amendedClauses: 'amended_clauses',
    productScheduleAction: 'product_schedule_action',
  },
};

export const getFieldsToExtractByContractType = (contractTypeId: number) => {
  const invoiceOnly = isInvoiceType(contractTypeId)
    ? Object.values(extractionFields.invoice)
    : [];

  if (isExchangeAgreementType(contractTypeId)) {
    return [
      ...Object.values(extractionFields.dateFields),
      ...Object.values(extractionFields.general).filter(
        (field) => field !== extractionFields.general.productsList,
      ),
      ...Object.values(extractionFields.dora),
      ...invoiceOnly,
    ];
  }

  switch (contractTypeId) {
    case contractTypes.Addendum:
      return [
        ...Object.values(extractionFields.dateFields),
        ...Object.values(extractionFields.general),
        ...Object.values(extractionFields.dora),
        ...Object.values(extractionFields.addendum),
      ];
    case contractTypes.NDA:
      return [
        extractionFields.dateFields.execution_date,
        extractionFields.dateFields.term_start_date,
        extractionFields.dateFields.cancel_by_date,
        extractionFields.general.dataDisposalTnc,
        extractionFields.general.allPartiesSigned,
        extractionFields.general.subscriptionTerm,
        extractionFields.dora.arbitrationAndConflictResolution,
        ...Object.values(extractionFields.nda),
      ];
    default:
      return [
        ...Object.values(extractionFields.dateFields),
        ...Object.values(extractionFields.general),
        ...Object.values(extractionFields.dora),
        ...invoiceOnly,
      ];
  }
};

export const fieldTransformations = {
  perpetual_nda: {
    outputPath: 'nda_insights.perpetual_nda',
  },
  unilateral_nda: {
    outputPath: 'nda_insights.unilateral_nda',
  },
  uncapped_liability: {
    outputPath: 'nda_insights.uncapped_liability',
  },
  post_end_of_term_obligations: {
    outputPath: 'nda_insights.post_end_of_term_obligations',
  },
  foreign_jurisdiction: {
    outputPath: 'nda_insights.foreign_jurisdiction',
  },
  no_carve_out_provisions: {
    outputPath: 'nda_insights.no_carve_out_provisions',
  },
  non_solicitation: {
    outputPath: 'nda_insights.non_solicitation',
  },
};

export const venderStatuses = {
  active: 'active',
  inactive: 'inactive',
  acquired: 'acquired',
  merged: 'merged',
  duplicate: 'duplicate',
};

export const MANAGER = 'Manager';
export const VIEWER = 'Viewer';
export const ADMIN = 'Admin';
export const POSTSIG_ADMIN = 'PostSig Admin';
export const POSTSIG_REVIEWER = 'PostSig Reviewer';
export const POSTSIG_EXTRACTOR = 'PostSig Extractor';
export const VIEWER_ROLE = userRoles.clientUser;
export const contractFieldsAITool = [
  'cancel_by_date',
  'cancel_date',
  'auto_renewal',
  'billing_frequency',
  'payment_terms',
  'exclusivity_terms',
  'multi_year',
  'annual_increase',
  'currency',
  'other_attributes',
  'cancellation_process',
  'distribution_rights',
  'execution_date',
  'geo_restrictions',
  'marketing_rights',
  'permissions',
  'scope_of_use',
  'status_id',
  'type_id',
  'summary',
  'renewal_type',
  'data_disposal_tnc',
  'status',
  'activities',
  'derivative_works',
  'end_users',
  'internal_external_users',
  'market_data_types',
  'audit_requirements',
  'term_end_date',
  'term_start_date',
  'cancel_date',
  'all_parties_signed',
  'number_of_users',
  'will_not_renew',
  'ai_training_restrictions',
  'arbitration_and_conflict_resolution',
  'cost_mitigation',
  'security_awareness',
  'service_level_agreements',
  'subscription_term',
];
