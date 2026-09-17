import { isInvoiceType } from '@/app/lib/constants';
import type { UserMetadata } from '@/constants/types';
import { sanitizeOrderNumber } from '@/lib/v2/contracts/orderNumber';
import type { OrgUnitLevel } from '@/lib/v2/org-units/levels';
import {
  earliestIsoDate,
  toIsoDate,
} from '@/lib/v2/spend/resolver/resolveFeeSegments';
import {
  scopeValuesOf,
  type EngineSpendStamp,
  type RecordedProductFee,
} from './amounts';
import { loadAllocationContextForRequest } from './context';
import {
  allocationProvenance,
  applicableScopes,
  percentToAmount,
  scopeValueFor,
} from './editor';
import type {
  InvoiceReportContractRef,
  InvoiceReportData,
  InvoiceReportRow,
  InvoiceReportTarget,
} from './invoice-report-rows';
import { targetKey, targetTypeLabel } from './picker';
import {
  leadAllocationProduct,
  uniqueAllocationProducts,
  type AllocationProductSource,
} from './products';
import { sharedNameBreadcrumbs } from './target-path';
import {
  DEFAULT_INVOICE_REPORT_PERIOD,
  INVOICE_WIDENING_PERIODS,
  isInReportWindow,
  isReportPeriod,
  resolveInvoiceWindow,
  type PresetReportPeriod,
  type ReportWindow,
  type ReportWindowParams,
  type ResolvedReportWindow,
} from './report-window';
import { resolveAllocations } from './resolver';
import type { AllocationContext, ResolvedContractAllocation } from './types';

export interface InvoiceReportContractRecord {
  type_id?: number | null;
  execution_date?: string | null;
  term_start_date?: Array<{ date: string }> | null;
  contract_types?: { name: string } | null;
  metadata?: { lineage?: { order_number?: unknown } | null } | null;
  vendor_products_details?: RecordedProductFee[] | null;
}

/** The slice of an enriched contract the report reads. */
export interface InvoiceReportSource {
  id: number;
  vendor_name: string;
  vendor_domain?: string;
  products: ReadonlyArray<AllocationProductSource>;
  contract: InvoiceReportContractRecord;
  engineSpend?: EngineSpendStamp;
}

/**
 * The date the engine books an invoice from — its earliest billing-period
 * start (resolveFeeSegments' invoice rule, the same anchor the discrepancies
 * report calls the invoice date) — falling back to the invoice date itself
 * when no billing period was extracted.
 */
export function invoiceBillingDate(
  record: InvoiceReportContractRecord,
): string | null {
  return (
    earliestIsoDate(record.term_start_date) ?? toIsoDate(record.execution_date)
  );
}

function contractRef(
  id: number,
  byId: ReadonlyMap<number, InvoiceReportSource>,
): InvoiceReportContractRef {
  const source = byId.get(id);
  const orderNumber = source
    ? sanitizeOrderNumber(source.contract.metadata?.lineage?.order_number)
    : null;
  return {
    id,
    label:
      orderNumber ??
      `${source?.contract.contract_types?.name ?? 'Contract'} · ID ${id}`,
  };
}

function buildRow(
  invoice: InvoiceReportSource,
  billingDate: string,
  resolved: ResolvedContractAllocation,
  ctx: AllocationContext,
  levelByUnitId: Record<number, OrgUnitLevel>,
  breadcrumbs: ReadonlyMap<number, string>,
  byId: ReadonlyMap<number, InvoiceReportSource>,
): InvoiceReportRow {
  const values = scopeValuesOf(invoice, true);
  const products = uniqueAllocationProducts(invoice.products);
  const scopes = applicableScopes(
    resolved.scopes,
    new Set(products.map((p) => p.id)),
  );
  const targets = scopes.flatMap((scope) => {
    const scopeValue = scopeValueFor(values, scope.productId);
    const productName =
      scope.productId === null
        ? null
        : (products.find((p) => p.id === scope.productId)?.name ??
          `Product #${scope.productId}`);
    return scope.lines.map((line): InvoiceReportTarget => {
      const breadcrumb =
        line.target.kind === 'org_unit'
          ? breadcrumbs.get(line.target.id)
          : undefined;
      return {
        key: targetKey(line.target),
        name: line.target.name,
        typeLabel: targetTypeLabel(line.target, levelByUnitId),
        ...(breadcrumb ? { breadcrumb } : {}),
        percent: line.percent,
        amount:
          scopeValue === null
            ? null
            : percentToAmount(line.percent, scopeValue),
        productId: scope.productId,
        productName,
      };
    });
  });
  const provenance = allocationProvenance(resolved);
  const parentId = ctx.hierarchy.parents.get(invoice.id);
  const firstProduct = leadAllocationProduct(products);

  return {
    id: invoice.id,
    vendor: invoice.vendor_name,
    vendorDomain: invoice.vendor_domain ?? '',
    product: firstProduct?.name ?? '',
    products: products.map(({ id, name }) => ({ id, name })),
    invoiceNumber: sanitizeOrderNumber(
      invoice.contract.metadata?.lineage?.order_number,
    ),
    billingDate,
    amount: values.contract,
    parentContract: parentId === undefined ? null : contractRef(parentId, byId),
    provenance,
    sourceContract:
      provenance.kind === 'inherited'
        ? contractRef(provenance.sourceContractId, byId)
        : null,
    hasScope: scopes.length > 0,
    targets,
    unlinkedUserCount: scopes.reduce(
      (sum, scope) => sum + scope.unlinkedUserCount,
      0,
    ),
  };
}

/**
 * Invoice-type contracts whose billing date falls in the window × the
 * resolver's allocation × the engine's recorded amount. Pure over the
 * contract set and the allocation context, so the page and tests share it.
 */
export function buildInvoiceReportRows(
  contracts: readonly InvoiceReportSource[],
  window: ReportWindow,
  ctx: AllocationContext,
): Pick<InvoiceReportData, 'rows' | 'undatedCount'> {
  const byId = new Map(contracts.map((c) => [c.id, c]));
  const dated: { invoice: InvoiceReportSource; billingDate: string }[] = [];
  let undatedCount = 0;
  for (const invoice of contracts) {
    if (!isInvoiceType(invoice.contract.type_id)) continue;
    const billingDate = invoiceBillingDate(invoice.contract);
    if (billingDate === null) {
      undatedCount++;
      continue;
    }
    if (isInReportWindow(billingDate, window)) {
      dated.push({ invoice, billingDate });
    }
  }

  const resolved = resolveAllocations(
    dated.map(({ invoice }) => ({ id: invoice.id })),
    ctx,
  );
  const levelByUnitId: Record<number, OrgUnitLevel> = {};
  for (const unit of ctx.unitsById.values())
    levelByUnitId[unit.id] = unit.level;
  const breadcrumbs = sharedNameBreadcrumbs(
    [...ctx.unitsById.values()],
    ctx.unitsById,
  );

  return {
    rows: dated.map(({ invoice, billingDate }) =>
      buildRow(
        invoice,
        billingDate,
        resolved.get(invoice.id) ?? { contractId: invoice.id, scopes: [] },
        ctx,
        levelByUnitId,
        breadcrumbs,
        byId,
      ),
    ),
    undatedCount,
  };
}

/**
 * No recognised `period` in the params = nobody chose one, so an empty default
 * widens until it finds invoices. An explicit period — a preset or a custom
 * range — is honoured exactly, empty or not: a user who picks a month is
 * asking about that month.
 */
export async function loadInvoiceCostAllocationReport(
  userMetadata: UserMetadata,
  params: ReportWindowParams,
  today: Date = new Date(),
): Promise<InvoiceReportData> {
  const fiscalConfig = { startMonth: userMetadata.organizationFY || 1 };
  // Lazy import keeps fixture tests off the contracts data layer (amounts.ts'
  // pattern). The same engine-stamped set the contracts table renders, so a
  // row's amount is the invoices folder's amount by construction.
  const { getContractsList } = await import('@/lib/v2/contracts/service');
  const [{ contracts }, ctx] = await Promise.all([
    getContractsList({ status: 'active', productValues: true }),
    loadAllocationContextForRequest(userMetadata.organizationId),
  ]);
  const build = (resolved: ResolvedReportWindow) => ({
    period: resolved.period,
    widenedFrom: null,
    window: resolved.window,
    custom: resolved.custom,
    ...buildInvoiceReportRows(contracts, resolved.window, ctx),
  });
  const buildPreset = (candidate: PresetReportPeriod) =>
    build(resolveInvoiceWindow({ period: candidate }, today, fiscalConfig));

  if (isReportPeriod(params.period)) {
    return build(resolveInvoiceWindow(params, today, fiscalConfig));
  }

  for (const candidate of INVOICE_WIDENING_PERIODS) {
    const report = buildPreset(candidate);
    if (report.rows.length > 0) {
      return candidate === DEFAULT_INVOICE_REPORT_PERIOD
        ? report
        : { ...report, widenedFrom: DEFAULT_INVOICE_REPORT_PERIOD };
    }
  }
  // Nothing anywhere: report the default period rather than an empty All Time,
  // which reads as a filter problem rather than an empty register.
  return buildPreset(DEFAULT_INVOICE_REPORT_PERIOD);
}
