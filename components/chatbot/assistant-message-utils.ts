import type { UIMessage } from '@ai-sdk/react';

export { getTextFromMessage } from '@/lib/v2/chat/persistence/ui-messages';

const BACKTICK_CONTRACT_RE =
  /`(\[Contract #\d+\]\(\/contracts\/\d+\))`|`(contract-\d+)`|`(Contract #\d+)`/gi;
const BACKTICK_VENDOR_RE =
  /`(\[Vendor #\d+\]\(\/vendors\/\d+\))`|`(vendor-\d+)`|`(Vendor #\d+)`/gi;

const CONTRACT_HYPHEN_RE =
  /\(contract-(\d+)\)|(?<![[\w])contract-(\d+)(?!\])/gi;
const CONTRACT_BRACKET_RE = /\[Contract #(\d+)\](?!\()/gi;
const CONTRACT_HASH_RE = /(?<![[\w])Contract #(\d+)(?![)\]])/g;
const ID_PAREN_RE = /\(id:\s*(\d+)\)/gi;
const ID_STANDALONE_RE = /(?<!\()id:\s*(\d+)(?!\))/gi;
const CONTRACT_PATH_RE = /(?<![\w(])\/contracts\/(\d+)(?!\))/g;
const VENDOR_HYPHEN_RE = /\(vendor-(\d+)\)|(?<![[\w])vendor-(\d+)(?!\])/gi;
const VENDOR_BRACKET_RE = /\[Vendor #(\d+)\](?!\()/gi;
const VENDOR_HASH_RE = /(?<![[\w])Vendor #(\d+)(?![)\]])/g;
const VENDOR_PATH_RE = /(?<![\w(])\/vendors\/(\d+)(?!\))/g;

function stripBacktickWrappedReferences(text: string): string {
  return text
    .replace(BACKTICK_CONTRACT_RE, (_, p1, p2, p3) => p1 || p2 || p3)
    .replace(BACKTICK_VENDOR_RE, (_, p1, p2, p3) => p1 || p2 || p3);
}

export function linkifyContractReferences(text: string): string {
  let result = stripBacktickWrappedReferences(text);

  result = result.replace(CONTRACT_HYPHEN_RE, (_, p1, p2) => {
    const id = p1 || p2;
    return `[Contract #${id}](/contracts/${id})`;
  });
  result = result.replace(CONTRACT_BRACKET_RE, '[Contract #$1](/contracts/$1)');
  result = result.replace(CONTRACT_HASH_RE, '[Contract #$1](/contracts/$1)');
  result = result.replace(CONTRACT_PATH_RE, '[Contract #$1](/contracts/$1)');

  result = result.replace(ID_PAREN_RE, '([Contract #$1](/contracts/$1))');
  result = result.replace(ID_STANDALONE_RE, '[Contract #$1](/contracts/$1)');

  result = result.replace(VENDOR_HYPHEN_RE, (_, p1, p2) => {
    const id = p1 || p2;
    return `[Vendor #${id}](/vendors/${id})`;
  });
  result = result.replace(VENDOR_BRACKET_RE, '[Vendor #$1](/vendors/$1)');
  result = result.replace(VENDOR_HASH_RE, '[Vendor #$1](/vendors/$1)');
  result = result.replace(VENDOR_PATH_RE, '[Vendor #$1](/vendors/$1)');

  return result;
}

export type AssistantResponseMode = 'tool_only' | 'synthesis';

export function hasSynthesisText(parts: UIMessage['parts']): boolean {
  return parts.some(
    (part) => part.type === 'text' && !!('text' in part && part.text.trim()),
  );
}

export function getAssistantResponseMode(
  parts: UIMessage['parts'],
): AssistantResponseMode {
  return hasSynthesisText(parts) ? 'synthesis' : 'tool_only';
}

export function isSuccessfulToolOutput(
  part: UIMessage['parts'][number],
): boolean {
  if (part.type === 'text') return false;
  if (!part.type.startsWith('tool-')) return false;
  if (!('state' in part)) return false;
  if (part.state !== 'output-available') return false;
  if (!('output' in part)) return false;
  return !!part.output;
}

export function countSuccessfulToolOutputs(parts: UIMessage['parts']): number {
  return parts.filter(isSuccessfulToolOutput).length;
}

export function isToolLoading(part: UIMessage['parts'][number]): boolean {
  if (!('state' in part)) return false;
  const s = (part as { state: string }).state;
  return (
    s === 'call' ||
    s === 'partial-call' ||
    s === 'input-streaming' ||
    s === 'input-available'
  );
}

export function countCompletedTools(toolParts: UIMessage['parts']): number {
  return toolParts.filter((part) => {
    if (!('state' in part)) return false;
    return (part as { state: string }).state === 'output-available';
  }).length;
}

function checkOutputHasData(output: unknown): boolean {
  if (typeof output !== 'object' || output === null) return true;
  if ('error' in output)
    return (output as { error: unknown }).error !== '_NO_RESULTS_';
  if (Array.isArray(output)) return output.length > 0;
  if ('contracts' in output) {
    const c = (output as { contracts: unknown }).contracts;
    return Array.isArray(c) && c.length > 0;
  }
  if ('count' in output) {
    const n = (output as { count: unknown }).count;
    return typeof n === 'number' && n > 0;
  }
  return true;
}

export function hasToolData(part: UIMessage['parts'][number]): boolean {
  if (!('output' in part)) return false;
  const output = (part as { output: unknown }).output;
  if (!output || typeof output === 'string') return false;
  return checkOutputHasData(output);
}

// --- Tool title helpers ---

type ToolArgs = Record<string, unknown>;

const str = (val: unknown): string | undefined =>
  typeof val === 'string' && val.trim() ? val.trim() : undefined;

function getSpendTitle(args?: ToolArgs): string {
  const vendor = str(args?.vendorName);
  if (vendor) return 'Spend Analysis: ' + vendor;
  const tag = str(args?.tagName);
  if (tag) return 'Spend by Tag: ' + tag;
  if (args?.contractId) return 'Spend: Contract #' + String(args.contractId);
  return 'Total Spend Analysis';
}

function getGroupsTitle(args?: ToolArgs): string {
  const group = str(args?.groupName);
  if (group) return 'Group: ' + group;
  const vendor = str(args?.vendorName);
  if (vendor) return 'Groups: ' + vendor;
  if (args?.listAll) return 'All Groups';
  return 'Group Access';
}

function getTagsTitle(args?: ToolArgs): string {
  const tag = str(args?.tagName);
  if (tag) return 'Tag: ' + tag;
  const vendor = str(args?.vendorName);
  if (vendor) return 'Tags: ' + vendor;
  if (str(args?.queryType) === 'list_all') return 'All Tags';
  return 'Tags';
}

function prefixedVendorLabel(args?: ToolArgs, prefix?: string): string {
  const vendor = str(args?.vendorName);
  const p = prefix ?? '';
  return vendor ? p + ': ' + vendor : p;
}

const TOOL_TITLE_MAP: Record<
  string,
  (args?: ToolArgs, outputType?: string) => string
> = {
  'tool-calculate_spend': getSpendTitle,
  'tool-query_clause': (args) => prefixedVendorLabel(args, 'Clause Analysis'),
  'tool-query_billing_frequency': (args) =>
    prefixedVendorLabel(args, 'Billing Frequency'),
  'tool-query_usage_restrictions': (args) =>
    prefixedVendorLabel(args, 'Usage Restrictions'),
  'tool-query_expiring_contracts': (args) =>
    prefixedVendorLabel(args, 'Expiring Contracts'),
  'tool-query_renewals': (args) => prefixedVendorLabel(args, 'Renewals'),
  'tool-query_discounts': (args) => prefixedVendorLabel(args, 'Discounts'),
  'tool-query_dora_compliance': (args) =>
    prefixedVendorLabel(args, 'DORA Compliance'),
  'tool-query_nda_risk': (args) => prefixedVendorLabel(args, 'NDA Risk'),
  'tool-query_asset_class': (args) =>
    prefixedVendorLabel(args, 'Asset Classes'),
  'tool-query_recent_uploads': (args) =>
    prefixedVendorLabel(args, 'Recent Uploads'),
  'tool-query_price_increase': (args) =>
    prefixedVendorLabel(args, 'Price Increases'),
  'tool-query_unexecuted': (args) =>
    prefixedVendorLabel(args, 'Unexecuted Contracts'),
  'tool-query_vendor_statistics': (args) =>
    prefixedVendorLabel(args, 'Vendor Statistics'),
  'tool-query_seat_utilization': (args) => {
    const product = str(args?.productName);
    if (product) return 'Seat Utilization: ' + product;
    return prefixedVendorLabel(args, 'Seat Utilization');
  },
  'tool-search_contracts': (args) => {
    const vendor = str(args?.vendorName);
    if (vendor) return 'Search: ' + vendor;
    const product = str(args?.productName);
    if (product) return 'Search: ' + product;
    return 'Search Results';
  },
  'tool-list_contracts': () => 'All Contracts',
  'tool-summarize_payment_terms': (args) =>
    prefixedVendorLabel(args, 'Payment Terms'),
  'tool-get_groups': getGroupsTitle,
  'tool-query_tags': getTagsTitle,
  'tool-synthesize_vendor_intelligence': (args) =>
    prefixedVendorLabel(args, 'Vendor Intelligence'),
};

export function getToolTitle(
  toolType: string,
  args?: ToolArgs,
  outputType?: string,
): string {
  const titleFn = TOOL_TITLE_MAP[toolType];
  if (titleFn) return titleFn(args, outputType);
  return toolType.replace('tool-', '').replace(/_/g, ' ');
}

export function extractToolMeta(part: UIMessage['parts'][number]) {
  const typed = part as {
    type: string;
    args?: ToolArgs;
    output?: { type: string };
  };
  return {
    title: getToolTitle(typed.type, typed.args, typed.output?.type),
  };
}

// Prose CSS class string shared across assistant messages
export const PROSE_CLASSES = [
  'prose prose-base max-w-none text-[length:var(--chat-msg-size,0.97rem)] text-foreground',
  'prose-headings:font-sans-neue prose-headings:font-semibold prose-strong:font-semibold prose-th:font-semibold',
  'dark:prose-invert prose-headings:text-foreground',
  'prose-h1:mt-6 prose-h1:text-[1.55em]',
  'prose-h2:mt-5 prose-h2:text-[1.29em]',
  'prose-h3:mt-4 prose-h3:text-[1.16em]',
  'prose-h4:mt-3 prose-h4:text-sm prose-h4:uppercase prose-h4:tracking-wide prose-h4:text-muted-foreground',
  'prose-p:my-3 prose-p:leading-relaxed',
  'prose-blockquote:my-6 prose-blockquote:border-l-3 prose-blockquote:border-blue-500',
  'prose-blockquote:bg-blue-500/10 prose-blockquote:px-5 prose-blockquote:pt-1 prose-blockquote:pb-2',
  'prose-blockquote:text-sm prose-blockquote:text-foreground prose-blockquote:not-italic',
  'prose-strong:text-foreground',
  'prose-code:rounded prose-code:bg-secondary prose-code:px-1.5 prose-code:py-1',
  'prose-code:font-mono prose-code:text-xs prose-code:text-foreground',
  'prose-code:before:content-none prose-code:after:content-none',
  'prose-pre:rounded prose-pre:border prose-pre:border-border prose-pre:bg-muted prose-pre:p-3 prose-pre:text-xs',
  'prose-ol:my-3 prose-ol:space-y-1.5 prose-ul:my-3 prose-ul:space-y-1.5',
  'prose-li:!my-0 prose-li:leading-relaxed',
  'prose-table:overflow-hidden prose-table:rounded prose-table:border prose-table:border-border prose-table:text-xs',
  'prose-th:bg-muted prose-th:px-3 prose-th:py-2 prose-th:text-left',
  'prose-td:border-t prose-td:border-border prose-td:px-3 prose-td:py-2',
].join(' ');
