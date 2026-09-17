import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { contractOwners, ownerGroupNames } from '@/lib/v2/owners/embed';
import { getContractsList } from '@/lib/v2';
import { filterExcludeInvoices } from '@/lib/v2/core/filters';
import { DatabaseError } from '@/lib/errors';
import { requireMcpContext } from '@/app/lib/mcp/context';
import { assertSameOrg } from '@/app/lib/mcp/guards';
import { REPORT_INFO } from '@/app/lib/mcp/tools/cpm/reports';
import { reverseContractTypeMap } from '@/app/lib/constants';

export interface McpResourceDef {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  /** Returns the JSON-serialisable body. The route handler wraps it in a
   *  ResourceContents envelope. */
  load: () => Promise<unknown>;
}

// Sourced from the contract_status Postgres enum in types/database.types.ts.
// Update both in sync if the enum changes.
const CONTRACT_STATUSES = ['unconfirmed', 'active', 'inactive'] as const;

function buildReportTypeCatalog() {
  return Object.entries(REPORT_INFO).map(([type, info]) => ({
    type,
    description: info.description,
    ...(info.acceptsRange ? { accepts: ['range_days'] } : {}),
    ...(info.rangeDescription
      ? { rangeDescription: info.rangeDescription }
      : {}),
  }));
}

async function loadContractTypes(): Promise<unknown> {
  const ctx = requireMcpContext();
  // contract_types is a global lookup with no organization_id — using the
  // service client is intentional. There's no RLS boundary here and the MCP
  // route has no Supabase session for a user-context client to consume.
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('contract_types')
    .select('id, name, description')
    .order('name', { ascending: true });
  if (error) {
    throw new DatabaseError(error.message || 'Failed to load contract types');
  }
  // Each row also carries its in-app abbreviation (e.g. "Master Services
  // Agreement" → "MSA") sourced from app/lib/constants.ts. Surfacing the
  // abbreviation here lets the agent resolve user phrases like "MSCI's
  // MSA" without scanning every contract one at a time.
  const enriched = (data ?? []).map((row) => ({
    ...row,
    abbreviation: reverseContractTypeMap[row.id] ?? null,
  }));
  return {
    note:
      'Contract type catalog. Use these IDs/names/abbreviations when filtering or interpreting contract_type fields. ' +
      'query_contracts accepts contract_type (matches name OR abbreviation, case-insensitive) — prefer this over scanning every contract when the user references an acronym like "MSA", "NDA", "SO", "TOS". ' +
      'Invoice types (Invoice, EAINV) are billing records, not contracts: contract lists exclude them unless the user explicitly asks for invoices.',
    organizationId: ctx.userMetadata.organizationId,
    contractTypes: enriched,
  };
}

async function loadBusinessGroups(): Promise<unknown> {
  const ctx = requireMcpContext();
  const { contracts } = await getContractsList();
  assertSameOrg(
    contracts,
    'business_groups_resource',
    (c) => c.contract?.organization_id,
  );
  const seen = new Map<string, number>();
  for (const c of filterExcludeInvoices(contracts)) {
    for (const name of ownerGroupNames(contractOwners(c.contract))) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      seen.set(trimmed, (seen.get(trimmed) ?? 0) + 1);
    }
  }
  const businessGroups = [...seen.entries()]
    .map(([name, count]) => ({ name, contractCount: count }))
    .sort((a, b) => b.contractCount - a.contractCount);
  return {
    note: 'Distinct business groups in this organization, with how many active contracts reference each. Use to ground business_group filters.',
    organizationId: ctx.userMetadata.organizationId,
    businessGroups,
  };
}

export const allMcpResources: McpResourceDef[] = [
  {
    uri: 'cpm://reference/contract-statuses',
    name: 'Contract statuses',
    description:
      'Enum of valid contract status values. Use to ground status filters.',
    mimeType: 'application/json',
    load: async () => ({ statuses: CONTRACT_STATUSES }),
  },
  {
    uri: 'cpm://reference/report-types',
    name: 'CPM report types',
    description:
      'Catalog of named reports the get_report_data tool can run. Each entry includes the type key and a short description; some accept range_days.',
    mimeType: 'application/json',
    load: async () => ({ reports: buildReportTypeCatalog() }),
  },
  {
    uri: 'cpm://reference/contract-types',
    name: 'Contract types',
    description:
      "Contract type catalog (id + name) sourced from the contract_types table. Use to interpret a contract's contract_type or to map between human names and ids.",
    mimeType: 'application/json',
    load: loadContractTypes,
  },
  {
    uri: 'cpm://reference/business-groups',
    name: 'Business groups',
    description:
      'Distinct business groups currently used by contracts in this organization, sorted by contract count. Use to ground business_group filters before calling list_contracts/query_contracts.',
    mimeType: 'application/json',
    load: loadBusinessGroups,
  },
];
