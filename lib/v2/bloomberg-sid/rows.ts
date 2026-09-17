import type { ContractTableRow, CurrentProduct } from '@/lib/v2/core/types';
import {
  SID_ROLLUP_PRODUCT_NAME,
  sidRenewingRollupKey,
  sidRollupKey,
} from './keys';
import {
  sidNextRenewalDate,
  sidRenewedMonthlyPrice,
  type SidSeat,
} from './spend';
import { cancelByIsoDate, isSidRenewingWithin } from './transforms';

interface SidRollupRowFields {
  /** The row's id: a rollup key, so no contract action can reach it. */
  key: string;
  vendorId: number;
  name: string;
  domain?: string;
  productName: string;
  /** The currency the row displays its figures in. */
  currency: string;
  current: number;
  projected: number;
  /** Org base currency, what totals and sorting read. */
  convertedCurrent: number;
  convertedProjected: number;
  termEndDate: string | null;
  cancelByDate: string | null;
}

const PUBLISHED_STATUS_ID = 4;
const MONTHS_PER_YEAR = 12;

const roundCents = (value: number): number => Math.round(value * 100) / 100;

function seatProduct(fields: SidRollupRowFields): CurrentProduct {
  return {
    product_id: 0,
    fees: fields.current,
    compoundedFees: fields.current,
    originalFees: fields.current,
    vendor_products: { id: 0, name: fields.productName },
    originalCurrency: fields.currency,
    isSuperseded: false,
  };
}

function annualDifferencePercent(current: number, projected: number): number {
  return current > 0 && projected > 0
    ? Math.round(((projected - current) / current) * 1000) / 10
    : 0;
}

/**
 * One table row for every seat of a vendor. The id keeps the row out of the
 * contract id space so no contract action can reach it, and the vendor cell
 * shows the name (and links) only for a processed document, so the row
 * presents as one.
 */
function sidRollupRow(fields: SidRollupRowFields): ContractTableRow {
  const products = [seatProduct(fields)];
  const id = fields.key;

  return {
    id,
    contract_id: id,
    vendor: fields.name,
    vendorId: String(fields.vendorId),
    vendorDomain: fields.domain ?? '',

    type: 'Subscription',
    typeId: 0,
    status: 'active',
    status_id: PUBLISHED_STATUS_ID,
    contractStatus: PUBLISHED_STATUS_ID,
    contract_status: 'active',
    renewalType: 'Auto',
    billingFrequency: 'Monthly',
    term: 0,
    renewalPeriod: 0,
    renewed: false,
    currency: fields.currency,
    aiExtractionStatus: 'h_success',
    fileName: '',

    termStartDate: null,
    executionDate: null,
    termEndDate: fields.termEndDate,
    originalStartDate: '',
    originalEndDate: '',
    cancelByDate: fields.cancelByDate,
    cancelByDateRange: null,

    currentBudget: fields.current,
    projectedBudget: fields.projected,
    annualCost: fields.current,
    annualDifference: annualDifferencePercent(fields.current, fields.projected),
    totalContractValue: 0,
    lifetimeContractValue: 0,
    discount: 0,
    annualIncrease: 0,

    convertedCurrentBudget: fields.convertedCurrent,
    convertedProjectedBudget: fields.convertedProjected,
    convertedAnnualCost: fields.convertedCurrent,
    convertedTotalContractValue: 0,
    convertedLifetimeContractValue: 0,
    originalCurrency: fields.currency,

    product: [{ product_id: 0, name: fields.productName }],
    currentProducts: products,
    currentYearProducts: products,

    businessSponsor: '',
    businessGroup: '',
    isDuplicate: false,
  };
}

export interface SidBudgetRowInput {
  vendorId: number;
  name: string;
  domain?: string;
  seats: number;
  /** Org base currency, the same figures the Top Vendors bars carry. */
  current: number;
  projected: number;
  currency: string;
}

/**
 * The budget table's Bloomberg row: every seat rolled up under the vendor on
 * the committed basis the table's other rows use. Dates stay blank because
 * seats renew on their own anniversaries.
 */
export function sidBudgetRow(input: SidBudgetRowInput): ContractTableRow {
  return sidRollupRow({
    key: sidRollupKey(input.vendorId),
    vendorId: input.vendorId,
    name: input.name,
    domain: input.domain,
    productName: `${SID_ROLLUP_PRODUCT_NAME} · ${input.seats} seats`,
    currency: input.currency,
    current: input.current,
    projected: input.projected,
    convertedCurrent: input.current,
    convertedProjected: input.projected,
    termEndDate: null,
    cancelByDate: null,
  });
}

/** Live seats whose next renewal falls within `rangeDays` of `today`, inclusive. */
export function sidSeatsRenewingWithin(
  seats: SidSeat[],
  today: Date,
  rangeDays: number,
): SidSeat[] {
  return seats.filter(
    (seat) =>
      seat.lastReportMonth === null &&
      isSidRenewingWithin(
        seat.terms[seat.terms.length - 1].renewalDate,
        rangeDays,
        today,
      ),
  );
}

export interface SidRenewalRowInput {
  /** Live seats renewing in the report's window, all billed in `currency`. */
  seats: SidSeat[];
  vendor: { id: number; name: string; domain?: string };
  today: Date;
  /** The report's window, which the row's link carries into the inventory view. */
  rangeDays: number;
  /** The seats' billing currency. */
  currency: string;
  /** Multiplier from `currency` into the org base currency. */
  toBase: number;
}

/**
 * The renewals report's Bloomberg row: the seats renewing in the window as
 * one line, dated at the earliest of their renewals with the inventory view's
 * 60-day cancel-by rule, valued at their annual price now and after the
 * estimated renewal step. Keyed with the window so the row opens the
 * inventory view on exactly those seats.
 */
export function sidRenewalRow(input: SidRenewalRowInput): ContractTableRow {
  const current = roundCents(
    input.seats.reduce(
      (sum, seat) =>
        sum + seat.terms[seat.terms.length - 1].monthlyPrice * MONTHS_PER_YEAR,
      0,
    ),
  );
  const projected = roundCents(
    input.seats.reduce(
      (sum, seat) =>
        sum +
        sidRenewedMonthlyPrice(seat.terms[seat.terms.length - 1].monthlyPrice) *
          MONTHS_PER_YEAR,
      0,
    ),
  );
  const termEndDate = input.seats
    .map((seat) => sidNextRenewalDate(seat, input.today))
    .sort()[0];
  const seatCount = input.seats.length;

  return sidRollupRow({
    key: sidRenewingRollupKey(input.vendor.id, input.rangeDays),
    vendorId: input.vendor.id,
    name: input.vendor.name,
    domain: input.vendor.domain,
    productName: `${seatCount} terminal ${seatCount === 1 ? 'seat' : 'seats'} renewing`,
    currency: input.currency,
    current,
    projected,
    convertedCurrent: roundCents(current * input.toBase),
    convertedProjected: roundCents(projected * input.toBase),
    termEndDate,
    cancelByDate: cancelByIsoDate(termEndDate),
  });
}
