'use client';

import type {
  TagsToolOutput,
  OrgTagsResult,
  TagsByContractResult,
  ContractsByTagResult,
  UntaggedContractsResult,
} from '@/lib/v2/chat/client';
import { isToolError, createBaseContractColumns } from '@/lib/v2/chat/client';
import {
  DataTable,
  type ColumnConfig,
} from '@/components/chatbot/GenericDataTable';
import { Tag, FileText, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// =============================================================================
// ROW TYPES
// =============================================================================

interface OrgTagRow extends Record<string, unknown> {
  id: number;
  name: string;
  contractCount: number;
}

interface ContractWithTagsRow extends Record<string, unknown> {
  contractId: number;
  vendorName: string;
  contractType: string;
  tags: string;
}

interface ContractByTagRow extends Record<string, unknown> {
  contractId: number;
  vendorName: string;
  contractType: string;
  summary: string;
}

interface UntaggedContractRow extends Record<string, unknown> {
  contractId: number;
  vendorName: string;
  contractType: string;
}

// =============================================================================
// COLUMN DEFINITIONS
// =============================================================================

const orgTagColumns: ColumnConfig<OrgTagRow>[] = [
  {
    key: 'name',
    header: 'Tag Name',
    render: (value) => (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="font-normal">
          {value as string}
        </Badge>
      </div>
    ),
  },
  {
    key: 'contractCount',
    header: 'Contracts',
    render: (value) => <span className="font-medium">{value as number}</span>,
    className: 'text-center',
    headerClassName: 'text-center',
  },
];

const contractWithTagsColumns: ColumnConfig<ContractWithTagsRow>[] = [
  ...createBaseContractColumns<ContractWithTagsRow>(),
  {
    key: 'tags',
    header: 'Tags',
    render: (value) => {
      const tagsStr = value as string;
      if (!tagsStr) return <span className="text-muted-foreground">-</span>;
      const tagNames = tagsStr.split(', ');
      return (
        <div className="flex flex-wrap gap-1">
          {tagNames.map((name) => (
            <Badge
              key={name}
              variant="secondary"
              className="font-normal text-xs"
            >
              {name}
            </Badge>
          ))}
        </div>
      );
    },
  },
];

const contractByTagColumns: ColumnConfig<ContractByTagRow>[] = [
  ...createBaseContractColumns<ContractByTagRow>(),
  {
    key: 'summary',
    header: 'Summary',
    render: (value) => (
      <span className="line-clamp-2 max-w-[200px]">
        {(value as string) || '-'}
      </span>
    ),
  },
];

const untaggedContractColumns: ColumnConfig<UntaggedContractRow>[] =
  createBaseContractColumns<UntaggedContractRow>();

// =============================================================================
// SUMMARY COMPONENTS
// =============================================================================

function OrgTagsSummary({ data }: { data: OrgTagsResult }) {
  const rows: OrgTagRow[] = data.tags.map((t) => ({
    id: t.id,
    name: t.name,
    contractCount: t.contractCount,
  }));

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No tags found in your organization.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Tag className="h-3.5 w-3.5" />
        <span>{data.tags.length} tags</span>
        <span className="text-muted-foreground/40">|</span>
        <span>{data.totalContracts} total contracts</span>
      </div>
      <DataTable
        data={rows}
        columns={orgTagColumns}
        title="Organization Tags"
        icon={<Tag className="h-4 w-4 text-muted-foreground" />}
        showExport={true}
        exportFilename="organization-tags"
        scrollAreaClassName="max-h-[300px] overflow-y-auto"
        striped={true}
        className="my-2"
      />
    </div>
  );
}

function ContractTagsSummary({ data }: { data: TagsByContractResult }) {
  const rows: ContractWithTagsRow[] = data.contracts.map((c) => ({
    contractId: c.contractId,
    vendorName: c.vendorName || '-',
    contractType: c.contractType || '-',
    tags: c.tags.map((t) => t.name).join(', '),
  }));

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No contracts found matching the query.
      </p>
    );
  }

  return (
    <DataTable
      data={rows}
      columns={contractWithTagsColumns}
      title="Contract Tags"
      icon={<FileText className="h-4 w-4 text-muted-foreground" />}
      showExport={true}
      exportFilename="contract-tags"
      scrollAreaClassName="max-h-[300px] overflow-y-auto"
      striped={true}
      className="my-2"
    />
  );
}

function ContractsByTagSummary({ data }: { data: ContractsByTagResult }) {
  const rows: ContractByTagRow[] = data.contracts.map((c) => ({
    contractId: c.contractId,
    vendorName: c.vendorName || '-',
    contractType: c.contractType || '-',
    summary: c.summary || '-',
  }));

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No contracts found with tag &quot;{data.tagName}&quot;.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary" className="font-normal">
          {data.tagName}
        </Badge>
        <span>
          {data.contracts.length} contract
          {data.contracts.length !== 1 ? 's' : ''}
        </span>
      </div>
      <DataTable
        data={rows}
        columns={contractByTagColumns}
        title={`Contracts Tagged "${data.tagName}"`}
        icon={<Tag className="h-4 w-4 text-muted-foreground" />}
        showExport={true}
        exportFilename={`contracts-tagged-${data.tagName.replace(/\s+/g, '-').toLowerCase()}`}
        scrollAreaClassName="max-h-[300px] overflow-y-auto"
        striped={true}
        className="my-2"
      />
    </div>
  );
}

function UntaggedContractsSummary({ data }: { data: UntaggedContractsResult }) {
  const rows: UntaggedContractRow[] = data.contracts.map((c) => ({
    contractId: c.contractId,
    vendorName: c.vendorName || '-',
    contractType: c.contractType || '-',
  }));

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        All contracts have been tagged.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <AlertCircle className="h-3.5 w-3.5" />
        <span>
          {data.count} untagged contract{data.count !== 1 ? 's' : ''}
        </span>
      </div>
      <DataTable
        data={rows}
        columns={untaggedContractColumns}
        title="Untagged Contracts"
        icon={<AlertCircle className="h-4 w-4 text-muted-foreground" />}
        showExport={true}
        exportFilename="untagged-contracts"
        scrollAreaClassName="max-h-[300px] overflow-y-auto"
        striped={true}
        className="my-2"
      />
    </div>
  );
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

export function TagsSummary({ data }: { data: TagsToolOutput }) {
  if (isToolError(data)) {
    if (data.error === '_NO_RESULTS_') {
      return null;
    }
    return (
      <p className="text-xs text-red-600 dark:text-red-400">{data.error}</p>
    );
  }

  switch (data.type) {
    case 'org_tags':
      return <OrgTagsSummary data={data} />;
    case 'contract_tags':
      return <ContractTagsSummary data={data} />;
    case 'contracts_by_tag':
      return <ContractsByTagSummary data={data} />;
    case 'untagged_contracts':
      return <UntaggedContractsSummary data={data} />;
    default:
      return null;
  }
}

export function TagsSummaryLoading() {
  return (
    <div className="animate-pulse space-y-1.5">
      <div className="h-3 w-24 rounded bg-muted" />
      <div className="h-3 w-48 rounded bg-muted" />
    </div>
  );
}
