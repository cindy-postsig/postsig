import type { AllocationProvenance } from './editor';
import type { ReportPeriod, ReportWindow } from './report-window';

// Row shapes and the in-memory filter/sort helpers the report's client
// component uses. Kept free of data-layer imports so it can be bundled for
// the browser; the loader and row builder live in invoice-report.ts.

export interface InvoiceReportTarget {
  key: string;
  name: string;
  typeLabel: string;
  /** Parent path, nearest first; present only when another org unit at the level shares the name (decision Q3). */
  breadcrumb?: string;
  percent: number;
  /** percent × the scope's engine value; null when the engine has no value for the scope. */
  amount: number | null;
  productId: number | null;
  productName: string | null;
}

export interface InvoiceReportContractRef {
  id: number;
  label: string;
}

export interface InvoiceReportRow {
  id: number;
  vendor: string;
  vendorDomain: string;
  product: string;
  products: { id: number; name: string }[];
  invoiceNumber: string | null;
  billingDate: string;
  /** The engine's recorded invoice amount in the org base currency; null = absent from the engine set. */
  amount: number | null;
  parentContract: InvoiceReportContractRef | null;
  provenance: AllocationProvenance;
  sourceContract: InvoiceReportContractRef | null;
  /** An allocation scope applies to this invoice (whole-record, or for a product it bills) — even one with no lines. */
  hasScope: boolean;
  targets: InvoiceReportTarget[];
  unlinkedUserCount: number;
}

export interface InvoiceReportData {
  period: ReportPeriod;
  /**
   * The period the report meant to show, when nothing was billed in it and the
   * window widened on its own. null whenever `period` is what was asked for —
   * so a widened view is never mistaken for a filter the user set.
   */
  widenedFrom: ReportPeriod | null;
  window: ReportWindow;
  /** The inclusive dates the user typed; null unless the period is custom. */
  custom: { from: string; to: string } | null;
  rows: InvoiceReportRow[];
  /** Invoices with no billing period and no invoice date: placeable in no window, so never listed. */
  undatedCount: number;
}

export interface InvoiceReportFilters {
  targetKeys: readonly string[];
  vendors: readonly string[];
}

/**
 * The allocation-target filter matches explicit line targets only (§Reports,
 * Q2b): an inherited line counts because it IS the invoice's resolved line;
 * an employee's cost-center attribute does not, since no line names it.
 */
export function filterInvoiceReportRows(
  rows: readonly InvoiceReportRow[],
  filters: InvoiceReportFilters,
): InvoiceReportRow[] {
  const targetKeys = new Set(filters.targetKeys);
  const vendors = new Set(filters.vendors);
  return rows.filter(
    (row) =>
      (vendors.size === 0 || vendors.has(row.vendor)) &&
      (targetKeys.size === 0 ||
        row.targets.some((target) => targetKeys.has(target.key))),
  );
}

export interface InvoiceReportOption {
  value: string;
  label: string;
}

/** The name a chip prints: the parent path beside it when another node at the level shares the name. */
export function invoiceReportTargetName(
  target: Pick<InvoiceReportTarget, 'name' | 'breadcrumb'>,
): string {
  return target.breadcrumb
    ? `${target.name} · ${target.breadcrumb}`
    : target.name;
}

/** One option per distinct target, named as its chip is; a name still shared across targets gets its type appended. */
export function invoiceReportTargetOptions(
  rows: readonly InvoiceReportRow[],
): InvoiceReportOption[] {
  const byKey = new Map<string, InvoiceReportTarget>();
  for (const row of rows) {
    for (const target of row.targets) {
      if (!byKey.has(target.key)) byKey.set(target.key, target);
    }
  }
  const nameCounts = new Map<string, number>();
  for (const target of byKey.values()) {
    const name = invoiceReportTargetName(target);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  return [...byKey.values()]
    .map((target) => {
      const name = invoiceReportTargetName(target);
      return {
        value: target.key,
        label:
          (nameCounts.get(name) ?? 0) > 1
            ? `${name} (${target.typeLabel})`
            : name,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function invoiceReportVendorOptions(
  rows: readonly InvoiceReportRow[],
): InvoiceReportOption[] {
  return [...new Set(rows.map((row) => row.vendor))]
    .sort((a, b) => a.localeCompare(b))
    .map((vendor) => ({ value: vendor, label: vendor }));
}

export interface InvoiceReportTargetTotal {
  key: string;
  name: string;
  typeLabel: string;
  breadcrumb?: string;
  amount: number;
}

/** Engine-valued spend per target, largest first; targets with no engine value contribute nothing. */
export function invoiceReportTargetTotals(
  rows: readonly InvoiceReportRow[],
): InvoiceReportTargetTotal[] {
  const totals = new Map<string, InvoiceReportTargetTotal>();
  for (const row of rows) {
    for (const target of row.targets) {
      if (target.amount === null) continue;
      const existing = totals.get(target.key);
      if (existing) {
        existing.amount += target.amount;
      } else {
        totals.set(target.key, {
          key: target.key,
          name: target.name,
          typeLabel: target.typeLabel,
          ...(target.breadcrumb ? { breadcrumb: target.breadcrumb } : {}),
          amount: target.amount,
        });
      }
    }
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount);
}

export function invoiceReportTotalAmount(
  rows: readonly InvoiceReportRow[],
): number {
  return rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
}

export type InvoiceReportSortKey =
  | 'vendor'
  | 'product'
  | 'contract'
  | 'invoiceNumber'
  | 'billingDate'
  | 'amount';

export type SortDirection = 'asc' | 'desc';

function sortText(row: InvoiceReportRow, key: InvoiceReportSortKey): string {
  switch (key) {
    case 'vendor':
      return row.vendor;
    case 'product':
      return row.product;
    case 'contract':
      return row.parentContract?.label ?? '';
    case 'invoiceNumber':
      return row.invoiceNumber ?? '';
    case 'billingDate':
      return row.billingDate;
    case 'amount':
      return '';
  }
}

/** Rows without an engine amount sort last in either direction; text keys collate numerically so INV-9 precedes INV-10. */
export function sortInvoiceReportRows(
  rows: readonly InvoiceReportRow[],
  key: InvoiceReportSortKey,
  direction: SortDirection,
): InvoiceReportRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === 'amount') {
      if (a.amount === null || b.amount === null) {
        return a.amount === b.amount ? 0 : a.amount === null ? 1 : -1;
      }
      return (a.amount - b.amount) * sign;
    }
    return (
      sortText(a, key).localeCompare(sortText(b, key), undefined, {
        numeric: true,
      }) * sign
    );
  });
}
