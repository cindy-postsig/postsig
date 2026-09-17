import { SpendSummary } from '@/components/chatbot/SpendSummary';
import { PaymentTermsSummary } from '@/components/chatbot/PaymentTermsSummary';
import { SearchResultsSummary } from '@/components/chatbot/SearchResultsSummary';
import { QueryResultsSummary } from '@/components/chatbot/query-results';
import { GroupsSummary } from '@/components/chatbot/GroupsSummary';
import { TagsSummary } from '@/components/chatbot/TagsSummary';
import { SynthesisSummary } from '@/components/chatbot/SynthesisSummary';
import { LazyMarkdown } from '@/components/chatbot/LazyMarkdown';
import { MarkdownDataTable } from '@/components/chatbot/MarkdownDataTable';

function DevMarkdownTable({ children }: { children?: React.ReactNode }) {
  return <MarkdownDataTable>{children}</MarkdownDataTable>;
}

const DEV_MARKDOWN_COMPONENTS = { table: DevMarkdownTable } as const;
import type {
  SpendToolOutput,
  PaymentTermsToolOutput,
  ContractSearchResult,
  QueryContractsResult,
  GroupsToolOutput,
  TagsToolOutput,
  SynthesisToolOutput,
} from '@/lib/v2/chat/client';

// =============================================================================
// MOCK DATA
// =============================================================================

const singleContractSpend: SpendToolOutput = {
  type: 'single_contract',
  contract: {
    contractId: 1042,
    vendorName: 'Bloomberg LP',
    contractType: 'Market Data',
    currency: 'USD',
    totalContractValueUSD: 450000,
    currentBudgetUSD: 125000,
    projectedBudgetUSD: 138000,
    termStartDate: '2024-01-01',
    termEndDate: '2026-12-31',
    products: [
      { product_id: 1, name: 'Terminal', fees: 85000 },
      { product_id: 2, name: 'Data License', fees: 40000 },
    ],
  },
  summary: 'Bloomberg LP has 1 active contract.',
};

const vendorTotalSpend: SpendToolOutput = {
  type: 'vendor_total',
  vendorName: 'Refinitiv',
  contractCount: 3,
  totals: {
    totalContractValueUSD: 920000,
    currentBudgetUSD: 310000,
    projectedBudgetUSD: 285000,
  },
  contracts: [
    {
      contractId: 2001,
      vendorName: 'Refinitiv',
      contractType: 'Market Data',
      currency: 'USD',
      totalContractValueUSD: 500000,
      currentBudgetUSD: 175000,
      projectedBudgetUSD: 160000,
      termStartDate: '2024-03-01',
      termEndDate: '2027-02-28',
      products: undefined,
    },
    {
      contractId: 2002,
      vendorName: 'Refinitiv',
      contractType: 'Analytics',
      currency: 'USD',
      totalContractValueUSD: 300000,
      currentBudgetUSD: 100000,
      projectedBudgetUSD: 115000,
      termStartDate: '2024-06-01',
      termEndDate: '2026-05-31',
      products: undefined,
    },
    {
      contractId: 2003,
      vendorName: 'Refinitiv',
      contractType: 'Index License',
      currency: 'USD',
      totalContractValueUSD: 120000,
      currentBudgetUSD: 35000,
      projectedBudgetUSD: 10000,
      termStartDate: '2025-01-01',
      termEndDate: '2025-12-31',
      products: undefined,
    },
  ],
  summary: 'Refinitiv has 3 active contracts totaling $920,000 TCV.',
};

const paymentTermsData: PaymentTermsToolOutput = {
  type: 'payment_terms_summary',
  vendorName: 'MSCI Inc.',
  contractCount: 3,
  lineageGroups: 1,
  contracts: [
    {
      id: 3001,
      contractType: 'Master Agreement',
      billingFrequency: 'Annually',
      currency: 'USD',
      paymentTerms:
        'Net 30 days from invoice date. Late payments subject to 1.5% monthly interest.',
      termStartDate: '2023-07-01',
      termEndDate: '2026-06-30',
      hasPaymentTerms: true,
      link: '/contracts/3001',
      isRoot: true,
      governedBy: undefined,
    },
    {
      id: 3002,
      contractType: 'Order Form',
      billingFrequency: 'Quarterly',
      currency: 'USD',
      paymentTerms: 'Net 30',
      termStartDate: '2024-01-01',
      termEndDate: '2025-12-31',
      hasPaymentTerms: true,
      link: '/contracts/3002',
      isRoot: false,
      governedBy: 3001,
    },
    {
      id: 3003,
      contractType: 'Amendment',
      billingFrequency: null,
      currency: 'EUR',
      paymentTerms: null,
      termStartDate: '2025-03-01',
      termEndDate: null,
      hasPaymentTerms: false,
      link: '/contracts/3003',
      isRoot: false,
      governedBy: 3001,
    },
  ],
  summary: 'MSCI Inc. has 3 contracts across 1 lineage group.',
};

const searchResults: ContractSearchResult[] = [
  {
    id: 4001,
    vendorName: 'S&P Global',
    productName: 'Capital IQ Pro',
    currentSpend: 250000,
    summary: 'Enterprise license for Capital IQ Pro platform with 50 seats.',
    termStartDate: '2024-01-15',
    termEndDate: '2026-01-14',
    contractType: 'SaaS Subscription',
  },
  {
    id: 4002,
    vendorName: 'S&P Global',
    productName: 'Market Intelligence',
    currentSpend: 180000,
    summary:
      'Market Intelligence data feed for real-time pricing and analytics.',
    termStartDate: '2023-06-01',
    termEndDate: '2025-05-31',
    contractType: 'Data License',
  },
  {
    id: 4003,
    vendorName: 'S&P Global',
    productName: 'Ratings Direct',
    currentSpend: 75000,
    summary: 'Credit ratings and research access for fixed income team.',
    termStartDate: '2025-01-01',
    termEndDate: '2025-12-31',
    contractType: 'Subscription',
  },
];

const expiringContracts: QueryContractsResult = {
  count: 3,
  totalTCV: 505000,
  contracts: [
    {
      id: 5001,
      vendor: 'FactSet',
      contractType: 'MSA',
      termEndDate: '2026-04-15',
      autoRenewal: true,
      tcv: 200000,
    },
    {
      id: 5002,
      vendor: 'Morningstar',
      contractType: 'SO',
      termEndDate: '2026-04-30',
      autoRenewal: false,
      tcv: 150000,
    },
    {
      id: 5003,
      vendor: 'ICE Data Services',
      contractType: 'MSA',
      termEndDate: '2026-05-10',
      autoRenewal: true,
      tcv: 155000,
    },
  ],
};

const autoRenewalData: QueryContractsResult = {
  count: 2,
  totalRenewalExposure: 350000,
  contracts: [
    {
      id: 6001,
      vendor: 'Bloomberg LP',
      termEndDate: '2026-06-30',
      cancelByDate: null,
      tcv: 200000,
      contractType: 'MSA',
      renewalType: 'Auto',
    },
    {
      id: 6002,
      vendor: 'Refinitiv',
      termEndDate: '2026-08-15',
      cancelByDate: null,
      tcv: 150000,
      contractType: 'SO',
      renewalType: 'Auto',
    },
  ],
};

const priceIncreaseData: QueryContractsResult = {
  type: 'price_increase',
  count: 3,
  totalIncreaseUSD: 67500,
  contracts: [
    {
      id: 7001,
      vendor: 'Bloomberg LP',
      contractType: 'Market Data',
      currentBudgetUSD: 125000,
      projectedBudgetUSD: 150000,
      increaseUSD: 25000,
      increasePercent: 20,
      termEndDate: '2026-12-31',
    },
    {
      id: 7002,
      vendor: 'MSCI Inc.',
      contractType: 'Index License',
      currentBudgetUSD: 85000,
      projectedBudgetUSD: 110000,
      increaseUSD: 25000,
      increasePercent: 29.4,
      termEndDate: '2026-06-30',
    },
    {
      id: 7003,
      vendor: 'FactSet',
      contractType: 'Analytics',
      currentBudgetUSD: 100000,
      projectedBudgetUSD: 117500,
      increaseUSD: 17500,
      increasePercent: 17.5,
      termEndDate: '2026-09-30',
    },
  ],
};

const dataQueryResult: QueryContractsResult = {
  type: 'data_query',
  contracts: [
    {
      id: 8001,
      vendor: 'Bloomberg LP',
      clauseContent:
        'Licensee may create derived works from the Licensed Data for internal use only. Redistribution of derived data requires prior written consent.',
      contractType: 'Market Data',
    },
    {
      id: 8002,
      vendor: 'MSCI Inc.',
      clauseContent:
        'No derived works permitted without explicit authorization. All index data remains the exclusive property of MSCI.',
      contractType: 'Index License',
    },
  ],
  excerpts: [
    {
      title: 'Derived Data',
      contractId: 8001,
      vendor: 'Bloomberg LP',
      content:
        'Section 4.2: Licensee may create derived works from the Licensed Data for internal use only.',
    },
    {
      title: 'Derived Data',
      contractId: 8002,
      vendor: 'MSCI Inc.',
      content: 'No derived works permitted without explicit authorization.',
    },
  ],
};

const billingFrequencyData: QueryContractsResult = [
  {
    id: 9001,
    vendor: 'Bloomberg LP',
    billingFrequency: 'Monthly',
    paymentTerms: 'Net 30',
  },
  {
    id: 9002,
    vendor: 'Refinitiv',
    billingFrequency: 'Quarterly',
    paymentTerms: 'Net 45',
  },
  {
    id: 9003,
    vendor: 'MSCI Inc.',
    billingFrequency: 'Annually',
    paymentTerms: 'Net 30',
  },
] as QueryContractsResult;

const usageRestrictionsData: QueryContractsResult = [
  {
    id: 10001,
    vendor: 'Bloomberg LP',
    scopeOfUse: 'Internal use only, authorized personnel',
    geoRestrictions: 'United States, United Kingdom, Hong Kong',
    distributionRights: 'No redistribution permitted',
  },
  {
    id: 10002,
    vendor: 'MSCI Inc.',
    scopeOfUse: 'Portfolio management and risk analysis',
    geoRestrictions: null,
    distributionRights: 'Limited to client reporting with attribution',
  },
] as QueryContractsResult;

const discountsData: QueryContractsResult = [
  { id: 11001, vendor: 'FactSet', discount: 15, currency: 'USD' },
  { id: 11002, vendor: 'Morningstar', discount: 10, currency: 'USD' },
  { id: 11003, vendor: 'S&P Global', discount: null, currency: 'USD' },
] as QueryContractsResult;

const doraComplianceData: QueryContractsResult = [
  {
    id: 12001,
    vendor: 'Bloomberg LP',
    doraScore: 3,
    maxScore: 5,
    missingCategories: ['Business Continuity', 'Subcontracting'],
  },
  {
    id: 12002,
    vendor: 'Refinitiv',
    doraScore: 2,
    maxScore: 5,
    missingCategories: ['ICT Risk Management', 'Incident Reporting', 'Testing'],
  },
] as QueryContractsResult;

const ndaRiskData: QueryContractsResult = [
  {
    id: 13001,
    vendor: 'Startup Co.',
    riskLevel: 3,
    riskFlags: 4,
    risks: [
      'No mutual NDA',
      'Missing IP assignment',
      'Weak confidentiality',
      'No non-solicit',
    ],
  },
  {
    id: 13002,
    vendor: 'Tech Partners',
    riskLevel: 2,
    riskFlags: 2,
    risks: ['Short duration (1 year)', 'No injunctive relief clause'],
  },
  {
    id: 13003,
    vendor: 'Safe Corp',
    riskLevel: 1,
    riskFlags: 1,
    risks: ['Minor: broad definition of confidential info'],
  },
] as QueryContractsResult;

const assetClassData: QueryContractsResult = [
  {
    id: 14001,
    vendor: 'MSCI Inc.',
    assetClasses: ['ESG', 'Equity'],
    marketDataTypes: 'Index Data, ESG Ratings',
  },
  {
    id: 14002,
    vendor: 'Bloomberg LP',
    assetClasses: ['Fixed Income', 'Equity', 'Commodities'],
    marketDataTypes: 'Real-time Pricing',
  },
] as QueryContractsResult;

const recentUploadsData: QueryContractsResult = {
  count: 2,
  contracts: [
    {
      id: 15001,
      vendor: 'New Vendor LLC',
      contractType: 'SaaS Subscription',
      summary: 'Cloud analytics platform annual subscription.',
      createdAt: '2026-03-14T10:30:00Z',
    },
    {
      id: 15002,
      vendor: 'Data Corp',
      contractType: 'Data License',
      summary: 'Alternative data feed for quantitative research.',
      createdAt: '2026-03-12T14:15:00Z',
    },
  ],
};

const orgGroupsData: GroupsToolOutput = {
  type: 'org_groups',
  groups: [
    { id: 1, name: 'Portfolio Management', memberCount: 12, contractCount: 45 },
    { id: 2, name: 'Risk & Compliance', memberCount: 8, contractCount: 32 },
    { id: 3, name: 'Quantitative Research', memberCount: 6, contractCount: 18 },
    { id: 4, name: 'Operations', memberCount: 15, contractCount: 28 },
  ],
};

const groupContractsData: GroupsToolOutput = {
  type: 'group_contracts',
  groupId: 1,
  groupName: 'Portfolio Management',
  memberCount: 12,
  contractCount: 3,
  contracts: [
    {
      contractId: 1042,
      vendorName: 'Bloomberg LP',
      contractType: 'Market Data',
      permission: 'admin',
    },
    {
      contractId: 2001,
      vendorName: 'Refinitiv',
      contractType: 'Market Data',
      permission: 'write',
    },
    {
      contractId: 3001,
      vendorName: 'MSCI Inc.',
      contractType: 'Index License',
      permission: 'read',
    },
  ],
};

const vendorGroupsData: GroupsToolOutput = {
  type: 'vendor_groups',
  vendorName: 'Bloomberg LP',
  groups: [
    { id: 1, name: 'Portfolio Management', permission: 'admin' },
    { id: 2, name: 'Risk & Compliance', permission: 'read' },
    { id: 4, name: 'Operations', permission: 'write' },
  ],
};

const orgTagsData: TagsToolOutput = {
  type: 'org_tags',
  tags: [
    { id: 1, name: 'Critical', contractCount: 15 },
    { id: 2, name: 'Market Data', contractCount: 42 },
    { id: 3, name: 'ESG', contractCount: 8 },
    { id: 4, name: 'Under Review', contractCount: 5 },
    { id: 5, name: 'Auto-Renewal', contractCount: 23 },
  ],
  totalContracts: 120,
};

const contractTagsData: TagsToolOutput = {
  type: 'contract_tags',
  contracts: [
    {
      contractId: 1042,
      vendorName: 'Bloomberg LP',
      contractType: 'Market Data',
      tags: [
        { id: 1, name: 'Critical' },
        { id: 2, name: 'Market Data' },
      ],
    },
    {
      contractId: 2001,
      vendorName: 'Refinitiv',
      contractType: 'Market Data',
      tags: [
        { id: 2, name: 'Market Data' },
        { id: 5, name: 'Auto-Renewal' },
      ],
    },
    {
      contractId: 3001,
      vendorName: 'MSCI Inc.',
      contractType: 'Index License',
      tags: [{ id: 3, name: 'ESG' }],
    },
  ],
};

const contractsByTagData: TagsToolOutput = {
  type: 'contracts_by_tag',
  tagName: 'ESG',
  contracts: [
    {
      contractId: 3001,
      vendorName: 'MSCI Inc.',
      contractType: 'Index License',
      summary: 'ESG ratings and climate data for portfolio screening.',
    },
    {
      contractId: 14001,
      vendorName: 'Sustainalytics',
      contractType: 'Data License',
      summary: 'ESG risk ratings covering 12,000+ companies.',
    },
  ],
};

const untaggedContractsData: TagsToolOutput = {
  type: 'untagged_contracts',
  count: 3,
  contracts: [
    {
      contractId: 15001,
      vendorName: 'New Vendor LLC',
      contractType: 'SaaS Subscription',
    },
    {
      contractId: 15002,
      vendorName: 'Data Corp',
      contractType: 'Data License',
    },
    {
      contractId: 15003,
      vendorName: 'Legacy Systems',
      contractType: 'Maintenance',
    },
  ],
};

const synthesisData: SynthesisToolOutput = {
  type: 'vendor_synthesis',
  vendorName: 'Bloomberg LP',
  executiveSummary:
    'Bloomberg LP represents your largest market data relationship with $450,000 in total contract value across 2 active agreements. Current spend is tracking 10.4% above budget due to additional terminal seats added in Q2. [Contract #1042] is the primary Master Agreement governing all Bloomberg services.',
  sections: [
    {
      title: 'Financial Overview',
      content:
        'Total annual spend of $125,000 with projected increase to $138,000 representing a 10.4% year-over-year increase. The primary driver is additional Terminal seats added under [Contract #1042].',
      insights: [
        'Spend is concentrated in Terminal licenses (68% of total)',
        'Data License costs have remained stable at $40,000/year',
        'Projected 10.4% increase is above the 7% industry average for market data',
      ],
      dataSource: 'spend',
    },
    {
      title: 'Payment & Billing',
      content:
        'Bloomberg bills annually with Net 30 payment terms. All invoices are in USD. No billing disputes recorded in the past 24 months.',
      insights: [
        'Annual billing cycle aligns with fiscal year',
        'Consistent payment terms across all Bloomberg contracts',
      ],
      dataSource: 'payment_terms',
    },
    {
      title: 'Access & Governance',
      content:
        'Three teams have access to Bloomberg data: Portfolio Management (admin), Risk & Compliance (read), and Operations (write). The Portfolio Management team has the broadest access with admin permissions.',
      insights: [
        '12 users in the Portfolio Management team have full admin access',
        'Consider reviewing if Operations team needs write access',
      ],
      dataSource: 'groups',
    },
  ],
  availableData: ['spend', 'payment_terms', 'groups'],
  missingData: ['tags'],
  recommendations: [
    'Negotiate volume discount given 10.4% spend increase - leverage multi-year commitment for better rates',
    'Review Operations team write access on [Contract #1042] - may be excessive for their workflow',
    'Add tags to Bloomberg contracts for better categorization and reporting',
  ],
  contractReferences: [{ contractId: 1042, vendorName: 'Bloomberg LP' }],
  partialResults: false,
  generatedAt: new Date().toISOString(),
};

const markdownSample = `Here's an analysis of your vendor concentration risk:

## Vendor Concentration Summary

Your top 3 vendors account for **72%** of total market data spend. Bloomberg LP alone represents 34% of your total contract value.

| Vendor | TCV | Share |
|--------|-----|-------|
| Bloomberg LP | $450,000 | 34% |
| Refinitiv | $320,000 | 24% |
| MSCI Inc. | $185,000 | 14% |
| Others | $365,000 | 28% |

### Key Risks
- **Single-vendor dependency**: Bloomberg provides both terminal and data feed services
- **Renewal clustering**: 3 major contracts expire within 60 days of each other
- **Limited alternatives**: For real-time fixed income pricing, only 2 viable alternatives exist

### Recommendations
1. Explore secondary providers for data feeds to reduce Bloomberg dependency
2. Stagger renewal dates to avoid negotiation pressure
3. Begin RFP process for at least one Bloomberg service category
`;

// =============================================================================
// COMPONENT
// =============================================================================

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="font-semibold mb-1 text-lg">{title}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{description}</p>
      <div className="max-w-[600px]">{children}</div>
    </div>
  );
}

export default function ChatbotComponentsPage() {
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <div>
        <h1 className="font-bold text-2xl">AI Assistant Component Gallery</h1>
        <p className="text-muted-foreground">
          All renderable component types with mock data for styling refinement.
        </p>
      </div>

      {/* TOOL COMPONENTS */}
      <div className="space-y-2">
        <h2 className="font-semibold border-b pb-2 text-xl">Tool Responses</h2>
        <p className="text-sm text-muted-foreground">
          Components rendered by individual tools (simple questions).
        </p>
      </div>

      <Section
        title="SpendSummary - Single Contract"
        description="tool-calculate_spend with a single contract result"
      >
        <SpendSummary data={singleContractSpend} />
      </Section>

      <Section
        title="SpendSummary - Vendor Total (Multi-Contract)"
        description="tool-calculate_spend with multiple contracts for a vendor"
      >
        <SpendSummary data={vendorTotalSpend} />
      </Section>

      <Section
        title="PaymentTermsSummary"
        description="tool-summarize_payment_terms with lineage groups"
      >
        <PaymentTermsSummary data={paymentTermsData} />
      </Section>

      <Section
        title="SearchResultsSummary"
        description="tool-search_contracts returning contract cards"
      >
        <SearchResultsSummary data={searchResults} />
      </Section>

      {/* QUERY CONTRACTS - ALL SUBTYPES */}
      <div className="space-y-2">
        <h2 className="font-semibold border-b pb-2 text-xl">
          Query Results (individual query tools)
        </h2>
        <p className="text-sm text-muted-foreground">
          Each query tool returns a different data shape and component.
        </p>
      </div>

      <Section
        title="Data Query (Clauses)"
        description="query_type: derived_data, ai_usage, liability, cancellation_process"
      >
        <QueryResultsSummary data={dataQueryResult} />
      </Section>

      <Section
        title="Expiring Contracts"
        description="query_type: expiring_soon"
      >
        <QueryResultsSummary data={expiringContracts} />
      </Section>

      <Section
        title="Auto-Renewal Exposure"
        description="query_type: auto_renewal"
      >
        <QueryResultsSummary data={autoRenewalData} />
      </Section>

      <Section title="Price Increases" description="query_type: price_increase">
        <QueryResultsSummary data={priceIncreaseData} />
      </Section>

      <Section title="Recent Uploads" description="query_type: recent_uploads">
        <QueryResultsSummary data={recentUploadsData} />
      </Section>

      <Section
        title="Billing Frequency"
        description="query_type: billing_frequency"
      >
        <QueryResultsSummary data={billingFrequencyData} />
      </Section>

      <Section
        title="Usage Restrictions"
        description="query_type: usage_restrictions"
      >
        <QueryResultsSummary data={usageRestrictionsData} />
      </Section>

      <Section title="Discounts" description="query_type: discounts">
        <QueryResultsSummary data={discountsData} />
      </Section>

      <Section
        title="DORA Compliance"
        description="query_type: dora_compliance"
      >
        <QueryResultsSummary data={doraComplianceData} />
      </Section>

      <Section title="NDA Risk Assessment" description="query_type: nda_risk">
        <QueryResultsSummary data={ndaRiskData} />
      </Section>

      <Section title="Asset Class" description="query_type: asset_class">
        <QueryResultsSummary data={assetClassData} />
      </Section>

      {/* GROUPS */}
      <div className="space-y-2">
        <h2 className="font-semibold border-b pb-2 text-xl">
          Groups (tool-get_groups)
        </h2>
      </div>

      <Section
        title="Organization Groups"
        description="All groups in the organization"
      >
        <GroupsSummary data={orgGroupsData} />
      </Section>

      <Section
        title="Group Contracts"
        description="Contracts accessible by a specific group"
      >
        <GroupsSummary data={groupContractsData} />
      </Section>

      <Section
        title="Vendor Groups"
        description="Groups with access to a specific vendor's contracts"
      >
        <GroupsSummary data={vendorGroupsData} />
      </Section>

      {/* TAGS */}
      <div className="space-y-2">
        <h2 className="font-semibold border-b pb-2 text-xl">
          Tags (tool-query_tags)
        </h2>
      </div>

      <Section
        title="Organization Tags"
        description="All tags in the organization"
      >
        <TagsSummary data={orgTagsData} />
      </Section>

      <Section
        title="Contract Tags"
        description="Tags assigned to specific contracts"
      >
        <TagsSummary data={contractTagsData} />
      </Section>

      <Section
        title="Contracts by Tag"
        description="Contracts filtered by a specific tag"
      >
        <TagsSummary data={contractsByTagData} />
      </Section>

      <Section
        title="Untagged Contracts"
        description="Contracts with no tags assigned"
      >
        <TagsSummary data={untaggedContractsData} />
      </Section>

      {/* SYNTHESIS */}
      <div className="space-y-2">
        <h2 className="font-semibold border-b pb-2 text-xl">
          Synthesis Engine
        </h2>
        <p className="text-sm text-muted-foreground">
          Complex responses combining tool data with AI analysis.
        </p>
      </div>

      <Section
        title="Vendor Intelligence Synthesis"
        description="tool-synthesize_vendor_intelligence - full vendor report"
      >
        <SynthesisSummary data={synthesisData} />
      </Section>

      <Section
        title="Markdown Response (Analysis)"
        description="Synthesis engine markdown output rendered by LazyMarkdown"
      >
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <LazyMarkdown components={DEV_MARKDOWN_COMPONENTS}>
            {markdownSample}
          </LazyMarkdown>
        </div>
      </Section>
    </div>
  );
}
