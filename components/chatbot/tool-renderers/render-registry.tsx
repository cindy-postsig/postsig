import dynamic from 'next/dynamic';
import { SpendSummaryLoading } from '@/components/chatbot/SpendSummary';
import { PaymentTermsSummaryLoading } from '@/components/chatbot/PaymentTermsSummary';
import { GroupsSummaryLoading } from '@/components/chatbot/GroupsSummary';
import { TagsSummaryLoading } from '@/components/chatbot/TagsSummary';
import { QueryResultsSummaryLoading } from '@/components/chatbot/query-results';
import { SynthesisSummaryLoading } from '@/components/chatbot/SynthesisSummary';
import type { ToolRendererConfig } from '@/components/chatbot/tool-renderers/types';
import type {
  SpendToolOutput,
  PaymentTermsToolOutput,
  GroupsToolOutput,
  TagsToolOutput,
  QueryContractsResult,
  AnnualIncreaseResult,
  SynthesisToolOutput,
} from '@/lib/v2/chat/client';

const LazySpendSummary = dynamic(
  () => import('@/components/chatbot/SpendSummary').then((m) => m.SpendSummary),
  { ssr: false },
);
const LazyPaymentTermsSummary = dynamic(
  () =>
    import('@/components/chatbot/PaymentTermsSummary').then(
      (m) => m.PaymentTermsSummary,
    ),
  { ssr: false },
);
const LazyGroupsSummary = dynamic(
  () =>
    import('@/components/chatbot/GroupsSummary').then((m) => m.GroupsSummary),
  { ssr: false },
);
const LazyTagsSummary = dynamic(
  () => import('@/components/chatbot/TagsSummary').then((m) => m.TagsSummary),
  { ssr: false },
);
const LazySynthesisSummary = dynamic(
  () =>
    import('@/components/chatbot/SynthesisSummary').then(
      (m) => m.SynthesisSummary,
    ),
  { ssr: false },
);
const LazyQueryResultsSummary = dynamic(
  () =>
    import('@/components/chatbot/query-results').then(
      (m) => m.QueryResultsSummary,
    ),
  { ssr: false },
);

function queryResultsEntry(errorLabel: string): ToolRendererConfig {
  return {
    loading: QueryResultsSummaryLoading,
    renderSummary: (data, key) => (
      <LazyQueryResultsSummary key={key} data={data as QueryContractsResult} />
    ),
    errorLabel,
  };
}

export const TOOL_REGISTRY: Record<string, ToolRendererConfig> = {
  'tool-calculate_spend': {
    loading: SpendSummaryLoading,
    renderSummary: (data, key) => (
      <LazySpendSummary key={key} data={data as SpendToolOutput} />
    ),
    errorLabel: 'Error calculating spend',
  },
  'tool-summarize_payment_terms': {
    loading: PaymentTermsSummaryLoading,
    renderSummary: (data, key) => (
      <LazyPaymentTermsSummary
        key={key}
        data={data as PaymentTermsToolOutput}
      />
    ),
    errorLabel: 'Error retrieving payment terms',
  },
  'tool-get_groups': {
    loading: GroupsSummaryLoading,
    renderSummary: (data, key) => (
      <LazyGroupsSummary key={key} data={data as GroupsToolOutput} />
    ),
    errorLabel: 'Error retrieving group information',
  },
  'tool-query_tags': {
    loading: TagsSummaryLoading,
    renderSummary: (data, key) => (
      <LazyTagsSummary key={key} data={data as TagsToolOutput} />
    ),
    errorLabel: 'Error retrieving tag information',
  },
  'tool-synthesize_vendor_intelligence': {
    loading: SynthesisSummaryLoading,
    renderSummary: (data, key) => (
      <LazySynthesisSummary key={key} data={data as SynthesisToolOutput} />
    ),
    errorLabel: 'Error synthesizing vendor intelligence',
  },
  'tool-query_clause': queryResultsEntry('Error querying clause data'),
  'tool-query_billing_frequency': queryResultsEntry(
    'Error querying billing frequency',
  ),
  'tool-query_usage_restrictions': queryResultsEntry(
    'Error querying usage restrictions',
  ),
  'tool-query_expiring_contracts': queryResultsEntry(
    'Error querying expiring contracts',
  ),
  'tool-query_renewals': queryResultsEntry('Error querying renewals'),
  'tool-query_discounts': queryResultsEntry('Error querying discounts'),
  'tool-query_dora_compliance': queryResultsEntry(
    'Error querying DORA compliance',
  ),
  'tool-query_nda_risk': queryResultsEntry('Error querying NDA risk'),
  'tool-query_asset_class': queryResultsEntry('Error querying asset classes'),
  'tool-query_recent_uploads': queryResultsEntry(
    'Error querying recent uploads',
  ),
  'tool-query_price_increase': queryResultsEntry(
    'Error querying price increases',
  ),
  'tool-query_unexecuted': queryResultsEntry(
    'Error querying unexecuted contracts',
  ),
  'tool-query_vendor_statistics': queryResultsEntry(
    'Error querying vendor statistics',
  ),
  'tool-query_seat_utilization': queryResultsEntry(
    'Error querying seat utilization',
  ),
  'tool-search_contracts': queryResultsEntry('Error searching contracts'),
  'tool-list_contracts': queryResultsEntry('Error listing contracts'),
  'tool-query_annual_increase': {
    loading: QueryResultsSummaryLoading,
    renderSummary: (data, key) => (
      <LazyQueryResultsSummary key={key} data={data as AnnualIncreaseResult} />
    ),
    errorLabel: 'Error querying annual increase data',
  },
};

export function renderToolFromRegistry(
  config: ToolRendererConfig,
  toolPart: { state: string; output?: unknown },
  key: string,
  isStillStreaming: boolean,
): React.ReactNode {
  const { loading: Loading, renderSummary, errorLabel } = config;

  switch (toolPart.state) {
    case 'call':
    case 'partial-call':
    case 'input-streaming':
    case 'input-available':
      return <Loading key={key} />;
    case 'output-available':
      if (toolPart.output === undefined) {
        return null;
      }
      if (
        isStillStreaming &&
        typeof toolPart.output === 'object' &&
        toolPart.output !== null &&
        'error' in toolPart.output
      ) {
        return null;
      }
      return renderSummary(toolPart.output, key);
    case 'output-error':
      if (isStillStreaming) return null;
      return (
        <div key={key} className="text-sm text-red-500">
          {errorLabel}
        </div>
      );

    default:
      return null;
  }
}
