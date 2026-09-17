'use client';

import React from 'react';
import type { UIMessage } from '@ai-sdk/react';
import type {
  PaymentTermsToolOutput,
  QueryContractsResult,
  AnnualIncreaseResult,
  SpendToolOutput,
} from '@/lib/v2/chat/client';
import { isToolError } from '@/lib/v2/chat/client';
import {
  getSpendColumnAliases,
  SPEND_TOTAL_ROW_LABEL,
} from '@/lib/v2/chat/guidance/spend-guidance';
import { getPaymentTermsColumnAliases } from '@/lib/v2/chat/guidance/payment-terms-guidance';
import { DataTable } from '@/components/chatbot/GenericDataTable';
import VendorIcon from '@/components/vendors/VendorIcon';
import { ContractLink } from '@/components/chatbot/ContractLink';
import {
  buildSpendTablePresentation,
  buildSpendFooterRow,
  spendColumns,
  getSpendColumns,
  hasMultipleVendors,
  type SpendTableRow,
  type SpendTotals,
} from '@/components/chatbot/SpendSummary';
import {
  buildPaymentTermsTablePresentation,
  buildPaymentTermsTableRow,
  paymentTermsColumns,
} from '@/components/chatbot/PaymentTermsSummary';
import {
  QueryResultsSummary,
  filterQueryContractsResultByIds,
} from '@/components/chatbot/query-results';
import { isQueryToolType } from '@/lib/v2/chat/tools/query-tool-names';
import { buildVendorDomainMap } from '@/components/chatbot/vendor-domains';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';

type CellValue = React.ReactNode;
type RowData = Record<string, CellValue>;
type ToolPart = UIMessage['parts'][number];

interface NormalizedTable {
  data: RowData[];
  keys: string[];
  headers: string[];
}

interface SpendColumnMap {
  contractId: number;
  vendorName: number;
  contractType: number;
  currentBudget: number;
  projectedBudget: number;
  tcv: number;
}

interface PaymentTermsColumnMap {
  contractId: number;
  billing: number;
  currency: number;
  term: number;
  paymentTerms: number;
}

type ElementWithChildren = React.ReactElement<{ children?: React.ReactNode }>;

function isTag(node: ElementWithChildren, tag: string): boolean {
  if (typeof node.type === 'string') return node.type === tag;
  // Streamdown wraps table tags in memo/forwardRef components like
  // MarkdownThead/MarkdownTd, so we identify by displayName/name regardless
  // of whether the wrapper itself is a function or an object.
  const t = node.type as { displayName?: string; name?: string };
  const name = (t.displayName ?? t.name ?? '').toLowerCase();
  return name === `markdown${tag}`;
}

function toElements(children: React.ReactNode): ElementWithChildren[] {
  return React.Children.toArray(children).filter(
    (child): child is ElementWithChildren => React.isValidElement(child),
  );
}

function textFromNode(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return '';
  return React.Children.toArray(node.props.children).map(textFromNode).join('');
}

function rowCells(row: ElementWithChildren): React.ReactNode[] {
  return toElements(row.props.children).map((cell) => cell.props.children);
}

function sectionRows(
  section: ElementWithChildren | null,
): ElementWithChildren[] {
  if (!section) return [];
  return toElements(section.props.children).filter((el) => isTag(el, 'tr'));
}

function slug(value: string, index: number): string {
  const cleaned = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || `column_${index + 1}`;
}

function uniqueKeys(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h, i) => {
    const base = slug(h, i);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function normalizeTable(children: React.ReactNode): NormalizedTable | null {
  const elements = toElements(children);
  const thead = elements.find((el) => isTag(el, 'thead')) ?? null;
  const tbody = elements.find((el) => isTag(el, 'tbody')) ?? null;

  const headRows = sectionRows(thead);
  const bodyRows = sectionRows(tbody);
  if (bodyRows.length === 0) return null;

  const headerNodes =
    headRows.length > 0 ? rowCells(headRows[0]) : rowCells(bodyRows[0]);
  const headers = headerNodes.map((node) => textFromNode(node).trim());
  const keys = uniqueKeys(headers);
  const dataStart = headRows.length > 0 ? 0 : 1;
  const dataRows = bodyRows.slice(dataStart);
  const data = dataRows.map((row) => {
    const cells = rowCells(row);
    return keys.reduce<RowData>((acc, key, i) => {
      acc[key] = cells[i] ?? '';
      return acc;
    }, {});
  });
  return { data, keys, headers };
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function findHeaderIndex(
  headers: string[],
  aliases: readonly string[],
): number {
  const normalizedHeaders = headers.map(normalizeHeader);
  return normalizedHeaders.findIndex((header) => aliases.includes(header));
}

function getSpendColumnMap(headers: string[]): SpendColumnMap | null {
  const contractId = findHeaderIndex(
    headers,
    getSpendColumnAliases('contractId'),
  );
  const vendorName = findHeaderIndex(
    headers,
    getSpendColumnAliases('vendorName'),
  );
  const contractType = findHeaderIndex(
    headers,
    getSpendColumnAliases('contractType'),
  );
  const currentBudget = findHeaderIndex(
    headers,
    getSpendColumnAliases('currentBudget'),
  );
  const projectedBudget = findHeaderIndex(
    headers,
    getSpendColumnAliases('projectedBudget'),
  );
  const tcv = findHeaderIndex(headers, getSpendColumnAliases('tcv'));

  if (
    contractId === -1 ||
    contractType === -1 ||
    currentBudget === -1 ||
    projectedBudget === -1 ||
    tcv === -1
  ) {
    return null;
  }

  return {
    contractId,
    vendorName,
    contractType,
    currentBudget,
    projectedBudget,
    tcv,
  };
}

function getPaymentTermsColumnMap(
  headers: string[],
): PaymentTermsColumnMap | null {
  const contractId = findHeaderIndex(
    headers,
    getPaymentTermsColumnAliases('contractId'),
  );
  const billing = findHeaderIndex(
    headers,
    getPaymentTermsColumnAliases('billing'),
  );
  const currency = findHeaderIndex(
    headers,
    getPaymentTermsColumnAliases('currency'),
  );
  const term = findHeaderIndex(headers, getPaymentTermsColumnAliases('term'));
  const paymentTerms = findHeaderIndex(
    headers,
    getPaymentTermsColumnAliases('paymentTerms'),
  );

  if (
    contractId === -1 ||
    billing === -1 ||
    currency === -1 ||
    term === -1 ||
    paymentTerms === -1
  ) {
    return null;
  }

  return {
    contractId,
    billing,
    currency,
    term,
    paymentTerms,
  };
}

function extractContractIdFromNode(node: React.ReactNode): number | null {
  if (typeof node === 'number') return Number.isFinite(node) ? node : null;
  if (typeof node === 'string') {
    const match = node.match(/(\d+)/);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    return Number.isNaN(value) ? null : value;
  }
  if (!React.isValidElement(node)) return null;

  const props = node.props as { href?: string; children?: React.ReactNode };
  if (typeof props.href === 'string') {
    const hrefMatch = props.href.match(/\/contracts\/(\d+)/);
    if (hrefMatch) {
      const value = parseInt(hrefMatch[1], 10);
      return Number.isNaN(value) ? null : value;
    }
  }

  const children = React.Children.toArray(props.children);
  for (const child of children) {
    const childId = extractContractIdFromNode(child);
    if (childId !== null) return childId;
  }

  return null;
}

function parseCurrencyValue(node: React.ReactNode): number | null {
  const text = textFromNode(node).trim();
  if (!text) return null;

  const negative = text.startsWith('(') && text.endsWith(')');
  const sanitized = text.replace(/[,$()]/g, '').replace(/[^0-9.-]/g, '');
  if (!sanitized) return null;

  const value = parseFloat(sanitized);
  if (!Number.isFinite(value)) return null;

  return negative ? -value : value;
}

function findLatestSpendToolOutput(
  toolParts: ToolPart[],
): SpendToolOutput | null {
  for (let i = toolParts.length - 1; i >= 0; i--) {
    const part = toolParts[i] as {
      type?: string;
      state?: string;
      output?: unknown;
    };
    if (
      part.type !== 'tool-calculate_spend' ||
      part.state !== 'output-available' ||
      !part.output
    ) {
      continue;
    }
    const output = part.output as SpendToolOutput;
    if (!isToolError(output)) {
      return output;
    }
  }

  return null;
}

function findLatestPaymentTermsToolOutput(
  toolParts: ToolPart[],
): PaymentTermsToolOutput | null {
  for (let i = toolParts.length - 1; i >= 0; i--) {
    const part = toolParts[i] as {
      type?: string;
      state?: string;
      output?: unknown;
    };
    if (
      part.type !== 'tool-summarize_payment_terms' ||
      part.state !== 'output-available' ||
      !part.output
    ) {
      continue;
    }
    const output = part.output as PaymentTermsToolOutput;
    if (!isToolError(output)) {
      return output;
    }
  }

  return null;
}

function findLatestContractQueryToolOutput(
  toolParts: ToolPart[],
): QueryContractsResult | AnnualIncreaseResult | null {
  for (let i = toolParts.length - 1; i >= 0; i--) {
    const part = toolParts[i] as {
      type?: string;
      state?: string;
      output?: unknown;
    };
    if (
      !part.type ||
      (!isQueryToolType(part.type) &&
        part.type !== 'tool-query_annual_increase') ||
      part.state !== 'output-available' ||
      !part.output
    ) {
      continue;
    }
    const output = part.output as QueryContractsResult | AnnualIncreaseResult;
    if (!isToolError(output) && typeof output !== 'string') {
      return output;
    }
  }

  return null;
}

function buildExclusionSet(spendOutput: SpendToolOutput): Set<number> {
  if (isToolError(spendOutput)) return new Set();
  if (spendOutput.type === 'single_contract') {
    return spendOutput.contract.isExcludedFromTotals
      ? new Set([spendOutput.contract.contractId])
      : new Set();
  }
  return new Set(
    spendOutput.contracts
      .filter((c) => c.isExcludedFromTotals)
      .map((c) => c.contractId),
  );
}

function parseSpendRows(
  table: NormalizedTable,
  columnMap: SpendColumnMap,
  excludedIds: Set<number>,
): SpendTableRow[] | null {
  const rows: SpendTableRow[] = [];

  for (const row of table.data) {
    const idCell = row[table.keys[columnMap.contractId]];
    const idCellText = textFromNode(idCell).trim();
    if (
      normalizeHeader(idCellText) === normalizeHeader(SPEND_TOTAL_ROW_LABEL)
    ) {
      continue;
    }

    const contractId = extractContractIdFromNode(idCell);
    const currentBudget = parseCurrencyValue(
      row[table.keys[columnMap.currentBudget]],
    );
    const projectedBudget = parseCurrencyValue(
      row[table.keys[columnMap.projectedBudget]],
    );
    const tcv = parseCurrencyValue(row[table.keys[columnMap.tcv]]);

    if (
      contractId === null ||
      currentBudget === null ||
      projectedBudget === null ||
      tcv === null
    ) {
      return null;
    }

    const vendorName =
      columnMap.vendorName !== -1
        ? textFromNode(row[table.keys[columnMap.vendorName]]).trim() || '-'
        : '-';

    rows.push({
      contractId,
      vendorName,
      contractType:
        textFromNode(row[table.keys[columnMap.contractType]]).trim() || '-',
      currentBudget,
      projectedBudget,
      tcv,
      isExcludedFromTotals: excludedIds.has(contractId),
    });
  }

  return rows.length > 0 ? rows : null;
}

function computeTotalsFromRows(rows: SpendTableRow[]): SpendTotals {
  return {
    totalContractValueUSD: rows.reduce((sum, r) => sum + r.tcv, 0),
    currentBudgetUSD: rows.reduce((sum, r) => sum + r.currentBudget, 0),
    projectedBudgetUSD: rows.reduce((sum, r) => sum + r.projectedBudget, 0),
  };
}

function renderSpendMarkdownTable(
  table: NormalizedTable,
  toolParts: ToolPart[],
  currency: string,
): React.ReactNode | null {
  const spendOutput = findLatestSpendToolOutput(toolParts);
  if (!spendOutput) return null;

  const columnMap = getSpendColumnMap(table.headers);
  if (!columnMap) return null;

  const excludedIds = buildExclusionSet(spendOutput);
  const rows = parseSpendRows(table, columnMap, excludedIds);
  if (!rows) return null;

  const showVendor = hasMultipleVendors(rows);
  const columns = getSpendColumns(showVendor, currency);
  const presentation = buildSpendTablePresentation(
    spendOutput,
    showVendor,
    currency,
  );
  if (!presentation) return null;

  return (
    <DataTable
      data={rows}
      columns={columns}
      title={presentation.title}
      exportFilename={presentation.exportFilename}
      showExport={true}
      scrollAreaClassName="max-h-[300px] overflow-y-auto"
      striped={true}
      className="my-6"
      footerRow={buildSpendFooterRow(
        computeTotalsFromRows(rows),
        showVendor,
        currency,
      )}
    />
  );
}

function parsePaymentTermsContractIds(
  table: NormalizedTable,
  columnMap: PaymentTermsColumnMap,
): number[] | null {
  const contractIds: number[] = [];

  for (const row of table.data) {
    const contractId = extractContractIdFromNode(
      row[table.keys[columnMap.contractId]],
    );
    if (contractId === null) {
      return null;
    }
    contractIds.push(contractId);
  }

  return contractIds.length > 0 ? contractIds : null;
}

function parseTableContractIds(table: NormalizedTable): number[] | null {
  const contractIdColumnIndex = findHeaderIndex(table.headers, [
    'id',
    'contractid',
  ]);
  if (contractIdColumnIndex === -1) {
    return null;
  }

  const contractIds: number[] = [];
  for (const row of table.data) {
    const contractId = extractContractIdFromNode(
      row[table.keys[contractIdColumnIndex]],
    );
    if (contractId === null) {
      return null;
    }
    contractIds.push(contractId);
  }

  return contractIds.length > 0 ? contractIds : null;
}

function renderPaymentTermsMarkdownTable(
  table: NormalizedTable,
  toolParts: ToolPart[],
): React.ReactNode | null {
  const paymentTermsOutput = findLatestPaymentTermsToolOutput(toolParts);
  if (!paymentTermsOutput) return null;
  if (isToolError(paymentTermsOutput)) return null;

  const columnMap = getPaymentTermsColumnMap(table.headers);
  if (!columnMap) return null;

  const contractIds = parsePaymentTermsContractIds(table, columnMap);
  if (!contractIds) return null;

  const presentation = buildPaymentTermsTablePresentation(paymentTermsOutput);
  if (!presentation) return null;

  const contractsById = new Map(
    paymentTermsOutput.contracts.map((contract) => [contract.id, contract]),
  );
  const rows = contractIds.map((contractId) => {
    const contract = contractsById.get(contractId);
    if (!contract) return null;
    return buildPaymentTermsTableRow(contract);
  });

  if (rows.some((row) => row === null)) {
    return null;
  }

  return (
    <DataTable
      data={rows.filter((row): row is NonNullable<typeof row> => row !== null)}
      columns={paymentTermsColumns}
      title={presentation.title}
      icon={presentation.icon}
      exportFilename={presentation.exportFilename}
      showExport={true}
      scrollAreaClassName="max-h-[300px] overflow-y-auto"
      striped={true}
      className="my-6"
    />
  );
}

function renderQueryContractsMarkdownTable(
  table: NormalizedTable,
  toolParts: ToolPart[],
): React.ReactNode | null {
  const queryContractsOutput = findLatestContractQueryToolOutput(toolParts);
  if (!queryContractsOutput) return null;

  const contractIds = parseTableContractIds(table);
  if (!contractIds) return null;

  const filteredOutput = filterQueryContractsResultByIds(
    queryContractsOutput,
    contractIds,
  );
  if (!filteredOutput) return null;

  return <QueryResultsSummary data={filteredOutput} />;
}

export function MarkdownDataTable(props: {
  children?: React.ReactNode;
  toolParts?: ToolPart[];
  isStreaming?: boolean;
}) {
  const { baseCurrency } = useBaseCurrency();
  const normalized = normalizeTable(props.children);
  if (!normalized || normalized.data.length === 0) {
    return <table>{props.children}</table>;
  }

  // During streaming, skip spend/payment-terms DataTable replacement to
  // avoid flicker from repeated unmount/remount on every streamed token.
  // Query contracts and other non-DataTable renderers are safe during streaming.
  if (!props.isStreaming) {
    const spendTable = renderSpendMarkdownTable(
      normalized,
      props.toolParts ?? [],
      baseCurrency,
    );
    if (spendTable) {
      return spendTable;
    }

    const paymentTermsTable = renderPaymentTermsMarkdownTable(
      normalized,
      props.toolParts ?? [],
    );
    if (paymentTermsTable) {
      return paymentTermsTable;
    }

    const queryContractsTable = renderQueryContractsMarkdownTable(
      normalized,
      props.toolParts ?? [],
    );
    if (queryContractsTable) {
      return queryContractsTable;
    }
  }

  const VENDOR_ALIASES = ['vendor', 'vendorname'];
  const ID_ALIASES = ['id', 'contractid'];

  const vendorColIndex = findHeaderIndex(normalized.headers, VENDOR_ALIASES);
  const idColIndex = findHeaderIndex(normalized.headers, ID_ALIASES);
  const vendorDomainMap = buildVendorDomainMap(props.toolParts ?? []);

  const columns = normalized.keys.map((key, i) => ({
    key,
    header: normalized.headers[i] || key,
    render: (value: unknown, row: Record<string, unknown>) => {
      const text = textFromNode(value as React.ReactNode).trim();

      if (i === vendorColIndex && text && text !== '-') {
        const domain = vendorDomainMap.get(text.toLowerCase()) ?? '';
        const vendorContent = (
          <>
            <VendorIcon name={text} domain={domain} width={24} height={24} />
            <span className="font-medium font-sans leading-tight">{text}</span>
          </>
        );
        const contractId =
          idColIndex !== -1
            ? extractContractIdFromNode(
                row[normalized.keys[idColIndex]] as React.ReactNode,
              )
            : null;
        if (contractId !== null) {
          return (
            <ContractLink
              contractId={contractId}
              className="flex items-center gap-2 text-foreground no-underline hover:text-foreground hover:underline"
            >
              {vendorContent}
            </ContractLink>
          );
        }
        return <div className="flex items-center gap-2">{vendorContent}</div>;
      }

      if (i === idColIndex) {
        const contractId = extractContractIdFromNode(value as React.ReactNode);
        if (contractId !== null) {
          return <ContractLink contractId={contractId} />;
        }
      }

      return <>{text || '—'}</>;
    },
    exportFormat: (value: unknown) =>
      textFromNode(value as React.ReactNode).trim(),
  }));
  return (
    <DataTable
      data={normalized.data}
      columns={columns}
      showExport={false}
      scrollAreaClassName="max-h-[300px] overflow-y-auto"
      striped
      className="my-6"
    />
  );
}
