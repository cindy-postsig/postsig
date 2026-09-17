'use client';

import React from 'react';
import type { UIMessage } from '@ai-sdk/react';
import { TableCopyDropdown, TableDownloadDropdown } from 'streamdown';
import { ContractLink } from '@/components/chatbot/ContractLink';
import VendorIcon from '@/components/vendors/VendorIcon';
import { DoraComplianceSummary } from '@/components/chatbot/query-results/summaries';
import type { DoraComplianceContract } from '@/lib/v2/chat/client';
import { buildVendorDomainMap } from '@/components/chatbot/vendor-domains';

type ToolPart = UIMessage['parts'][number];

export const MarkdownTableContext = React.createContext<{
  toolParts: UIMessage['parts'];
  isStreaming: boolean;
}>({ toolParts: [], isStreaming: false });

type ElementWithChildren = React.ReactElement<{ children?: React.ReactNode }>;

function isTag(node: ElementWithChildren, tag: string): boolean {
  if (typeof node.type === 'string') return node.type === tag;
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

function extractContractIdFromNode(node: React.ReactNode): number | null {
  if (typeof node === 'number') return Number.isFinite(node) ? node : null;
  if (typeof node === 'string') {
    const m = node.match(/(\d+)/);
    if (!m) return null;
    const v = parseInt(m[1], 10);
    return Number.isNaN(v) ? null : v;
  }
  if (!React.isValidElement(node)) return null;
  const props = node.props as { href?: string; children?: React.ReactNode };
  if (typeof props.href === 'string') {
    const hm = props.href.match(/\/contracts\/(\d+)/);
    if (hm) {
      const v = parseInt(hm[1], 10);
      if (!Number.isNaN(v)) return v;
    }
  }
  for (const child of React.Children.toArray(props.children)) {
    const id = extractContractIdFromNode(child);
    if (id !== null) return id;
  }
  return null;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const norm = headers.map(normalizeHeader);
  return norm.findIndex((h) => aliases.includes(h));
}

// Keep in sync with REPORT_INFO in app/lib/mcp/tools/reports.ts.
const REPORT_TITLES: Record<string, string> = {
  unconfirmed: 'Unconfirmed Contracts',
  trial: 'Trial Contracts',
  nda: 'NDAs',
  unexecuted: 'Unexecuted Contracts',
  dora: 'DORA Compliance Report',
  'contract-omissions': 'Contract Omissions',
  invoices: 'Invoice Discrepancies',
  utilization: 'Utilization Report',
  'auto-renewals': 'Auto-Renewing Contracts',
  'manual-renewals': 'Manual Renewals',
  'recently-renewed': 'Recently Renewed Contracts',
};

function findLatestReportContext(
  toolParts: ToolPart[],
): { title: string; type: string; rows: unknown[] | null } | null {
  for (let i = toolParts.length - 1; i >= 0; i--) {
    const part = toolParts[i] as {
      type?: string;
      state?: string;
      input?: { type?: string };
      args?: { type?: string };
      output?: { rows?: unknown[] };
    };
    if (
      part.type !== 'tool-get_report_data' ||
      part.state !== 'output-available'
    ) {
      continue;
    }
    const reportType = part.input?.type ?? part.args?.type;
    if (typeof reportType !== 'string') return null;
    return {
      title: REPORT_TITLES[reportType] ?? reportType,
      type: reportType,
      rows: Array.isArray(part.output?.rows) ? part.output.rows : null,
    };
  }
  return null;
}

interface DoraReportRowShape {
  id?: string | number;
  contract_id?: string | number;
  vendor?: string;
  type?: string | string[];
  doraScoreValue?: number;
  missingDoraCategories?: string[];
  hasICTVendor?: boolean;
}

function adaptDoraRows(rows: unknown[]): DoraComplianceContract[] {
  return rows.map((r) => {
    const row = (r ?? {}) as DoraReportRowShape;
    const idRaw = row.contract_id ?? row.id;
    const id = typeof idRaw === 'number' ? idRaw : Number(idRaw) || 0;
    const contractType = Array.isArray(row.type)
      ? row.type.join(', ')
      : row.type;
    return {
      id,
      vendor: row.vendor,
      contractType,
      doraScore: row.doraScoreValue ?? 0,
      maxScore: 9,
      missingCategories: row.missingDoraCategories ?? [],
      hasICTVendor: row.hasICTVendor ?? false,
    };
  });
}

function renderSpecializedReport(
  reportType: string,
  rows: unknown[],
): React.ReactNode | null {
  if (reportType === 'dora') {
    return <DoraComplianceSummary data={adaptDoraRows(rows)} />;
  }
  return null;
}

interface ParsedTable {
  headers: string[];
  rows: React.ReactNode[][];
}

function parseTable(children: React.ReactNode): ParsedTable | null {
  const elements = toElements(children);
  const thead = elements.find((el) => isTag(el, 'thead')) ?? null;
  const tbody = elements.find((el) => isTag(el, 'tbody')) ?? null;
  if (!thead && !tbody) return null;

  let headers: string[] = [];
  if (thead) {
    const headerRow = toElements(thead.props.children).find((el) =>
      isTag(el, 'tr'),
    );
    if (headerRow) {
      headers = toElements(headerRow.props.children).map((cell) =>
        textFromNode(cell).trim(),
      );
    }
  }

  let rows: React.ReactNode[][] = [];
  if (tbody) {
    const bodyRows = toElements(tbody.props.children).filter((el) =>
      isTag(el, 'tr'),
    );
    rows = bodyRows.map((row) =>
      toElements(row.props.children).map((cell) => cell.props.children),
    );
  }

  if (headers.length === 0 && rows.length === 0) return null;
  return { headers, rows };
}

const VENDOR_ALIASES = ['vendor', 'vendorname'];
const ID_ALIASES = ['id', 'contractid'];

export function EnrichedMarkdownTable({
  children,
}: {
  children?: React.ReactNode;
  node?: unknown;
}) {
  const { toolParts } = React.useContext(MarkdownTableContext);
  const parsed = parseTable(children);

  const vendorDomainMap = React.useMemo(
    () => buildVendorDomainMap(toolParts),
    [toolParts],
  );

  if (!parsed) {
    return <table>{children}</table>;
  }

  const { headers, rows } = parsed;
  const vendorCol = findColumnIndex(headers, VENDOR_ALIASES);
  const idCol = findColumnIndex(headers, ID_ALIASES);
  const reportContext = findLatestReportContext(toolParts);
  const specialized =
    reportContext && reportContext.rows
      ? renderSpecializedReport(reportContext.type, reportContext.rows)
      : null;

  return (
    <div
      data-streamdown="table-wrapper"
      className="not-prose !my-6 flex flex-col gap-2 rounded-md border border-border bg-card/40"
    >
      {reportContext && (
        <div className="flex items-center justify-between gap-2 p-3 pb-1">
          <h3 className="font-medium text-sm text-foreground">
            {reportContext.title}
          </h3>
          <div className="flex items-center gap-1">
            <TableCopyDropdown />
            <TableDownloadDropdown />
          </div>
        </div>
      )}
      {specialized ? (
        <div className="px-3 pb-3">{specialized}</div>
      ) : (
        <div className="overflow-x-auto rounded-md">
          <table
            className="w-full border-collapse divide-y divide-border text-[0.825rem] leading-tight"
            style={{ borderSpacing: 0 }}
          >
            {headers.length > 0 && (
              <thead className="bg-muted/60">
                <tr>
                  {headers.map((h, i) => (
                    <th
                      key={i}
                      className="font-normal px-3 py-1.5 text-left align-middle font-sans-neue text-xs leading-tight"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            {rows.length > 0 && (
              <tbody className="divide-y divide-border">
                {rows.map((row, rIdx) => {
                  const rowContractId =
                    idCol !== -1 ? extractContractIdFromNode(row[idCol]) : null;
                  return (
                    <tr key={rIdx} className="even:bg-secondary/15">
                      {row.map((cell, cIdx) => {
                        if (cIdx === vendorCol) {
                          const text = textFromNode(cell).trim();
                          if (text && text !== '-') {
                            const domain =
                              vendorDomainMap.get(text.toLowerCase()) ?? '';
                            const content = (
                              <span className="flex items-center gap-2">
                                <VendorIcon
                                  name={text}
                                  domain={domain}
                                  width={20}
                                  height={20}
                                />
                                <span className="font-medium">{text}</span>
                              </span>
                            );
                            return (
                              <td key={cIdx} className="px-3 py-3 align-middle">
                                {rowContractId !== null ? (
                                  <ContractLink
                                    contractId={rowContractId}
                                    className="text-foreground no-underline hover:text-foreground hover:underline"
                                  >
                                    {content}
                                  </ContractLink>
                                ) : (
                                  content
                                )}
                              </td>
                            );
                          }
                        }

                        if (cIdx === idCol && rowContractId !== null) {
                          return (
                            <td key={cIdx} className="px-3 py-3 align-middle">
                              <ContractLink contractId={rowContractId} />
                            </td>
                          );
                        }

                        return (
                          <td key={cIdx} className="px-3 py-3 align-middle">
                            {cell}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
