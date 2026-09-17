/**
 * Invoices Report Pipeline Definition
 */

import { PipelineOptions, ReportPipeline } from '../pipeline/types';
import {
  buildInvoicesRows,
  InvoicesReportRow,
  processInvoiceData,
} from '../transforms/invoices';
import { resolveSegmentFeeContext } from '../transforms/segmentContext';
import { InvoiceDataContext, InvoiceData } from '../filters';
import { isInvoiceType } from '@/app/lib/constants';

/**
 * Smallest gap that counts as a real billing discrepancy. Now that the totals
 * are compared unrounded, prorating an indivisible fee leaves a remainder below
 * a cent — a $1,000 annual fee billed monthly expects $83.3333… against a
 * billed $83.33 — as does converting a non-USD fee. Those are artifacts of the
 * arithmetic, not something a vendor over-billed, so they must not open a row.
 *
 * Half a cent, less slack for the double-precision error that accumulates
 * across the per-product division and summation: an exact half-cent gap
 * computes as 0.00499999999999545, which a bare `>= 0.005` would discard.
 */
export const MIN_DISCREPANCY = 0.005 - 1e-6;

export const invoicesReport: ReportPipeline<
  PipelineOptions,
  InvoiceDataContext,
  InvoicesReportRow
> = {
  metadata: {
    // Invoices report needs to show invoices (they are the main data)
    includeInvoices: true,
  },

  filter: (contracts) => {
    const filtered = contracts.filter((c) => {
      if (!isInvoiceType(c.contract.type_id)) return false;
      if (!Array.isArray(c.contract.contract_relationships)) return false;
      if (
        !c.contract.contract_relationships.some(
          (r: any) => r.active === true && r.disabled !== true,
        )
      )
        return false;

      const invoiceStatus = c.contract.invoice_status;
      if (
        invoiceStatus === 'void' ||
        invoiceStatus === 'paid' ||
        invoiceStatus === 'approved'
      )
        return false;

      return true;
    });
    return { contracts: filtered };
  },

  enrich: async (contracts, options): Promise<InvoiceDataContext> => {
    const invoiceDataContext: InvoiceDataContext = new Map();

    // Expected fees come from the spend resolver's segments, resolved once
    // over the FULL contract set with real lineage — amendments and PSK-1830
    // cancellation cutoffs included. The runner threads the set and the
    // lineage inputs its caller's fetch already resolved; the shared builder
    // fetches anything missing. If context cannot be built, the per-row
    // transform falls back to the legacy fee walk.
    const segmentCtx = await resolveSegmentFeeContext({
      allContracts: options?.allContracts ?? contracts,
      relationships: options?.relationships,
      cutoffsByContract: options?.cutoffsByContract,
    });

    for (const contract of contracts) {
      const invoiceData = await processInvoiceData(
        contract.contract,
        segmentCtx,
      );
      invoiceDataContext.set(contract.id, invoiceData as InvoiceData);
    }

    return invoiceDataContext;
  },

  transform: (contracts, context) => {
    const rows = buildInvoicesRows(contracts, context);
    // Keep rows that have a discrepancy or unmatched products
    return rows.filter(
      (row) =>
        Math.abs(row.discrepancy || 0) >= MIN_DISCREPANCY ||
        row.hasUnmatchedProducts,
    );
  },

  // Use plain reduce instead of sumValuesInUSD because every row in this
  // report is a linked child invoice, and sumValuesInUSD skips those.
  calculateTotal: (rows, valueField) => {
    if (valueField !== 'discrepancy') {
      return rows.reduce((sum, row) => {
        const value = row[valueField as keyof InvoicesReportRow];
        return sum + (typeof value === 'number' ? value : 0);
      }, 0);
    }

    // Sum the stamped base-currency figure: rows keep their source currency,
    // and the aggregate converts at each invoice's date rate (PSK-1796).
    return rows.reduce((sum, row) => {
      const discrepancy = Math.abs(row.discrepancyBase || 0);
      const multiplier = row.invoiceFreqMultiplier || 1;
      return sum + discrepancy * multiplier;
    }, 0);
  },
};
