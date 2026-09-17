import {
  sub,
  differenceInDays,
  format,
  getMonth,
  parseISO,
  startOfMonth,
  endOfMonth,
  formatDate,
  isBefore,
} from 'date-fns';
import { SortingFn } from '@tanstack/react-table';
import logger from '@/utils/pino';
import { type ContractTableRow } from '@/lib/v2/core/types';
import { toCompareKey, toFoldKey } from '@/lib/name-matching';
import crypto from 'crypto';

export function formatParticipationCap(
  participationCap: number | null,
): string {
  if (participationCap === null) return '-';
  if (participationCap === -1) return 'No Cap';
  if (participationCap === -2) return 'Not Applicable';
  return `${participationCap}x`;
}

// Constructing an Intl.NumberFormat is expensive next to formatting with one,
// and a table of money calls this once per cell against a handful of distinct
// option sets.
const currencyFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(
  currency: string,
  maximumFractionDigits: number,
): Intl.NumberFormat {
  const key = `${currency}:${maximumFractionDigits}`;
  const cached = currencyFormatters.get(key);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits,
  });
  currencyFormatters.set(key, formatter);
  return formatter;
}

export function formatCurrency(
  value: number,
  currency?: string,
  showCents?: boolean,
): string | null {
  // No rounding, preserve exact value
  return currencyFormatter(
    currency || 'USD',
    showCents === true ? 2 : 0,
  ).format(value);
}

/**
 * Format an FX multiplier to 4 significant figures with trailing zeros trimmed,
 * for the contract-details caption disclosing the rate a converted amount was
 * derived from (e.g. 0.920341 -> "0.9203", 1.2 -> "1.2").
 */
export function formatFxRate(rate: number): string {
  return parseFloat(rate.toPrecision(4)).toString();
}

/**
 * Format a full currency amount with thousands separators and no abbreviation,
 * preserving the exact value. Cents are shown only when the value has a
 * fractional part: whole amounts render without decimals ("$847,120") while
 * fractional amounts show proper two-digit cents ("$2,547,832.46").
 */
export function formatCurrencyFull(
  value: number,
  currency?: string | null,
): string {
  const hasCents = !Number.isInteger(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a price-per-share (PPS) value for display. PPS is always shown with 4
 * decimal places — trailing zeros retained — so small per-unit prices stay
 * legible and precision is consistent across every view.
 * e.g. 1.5 -> "$1.5000", 0.804670264 -> "$0.8047".
 */
export function formatPricePerShare(
  value: number,
  currency?: string | null,
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

/**
 * Resolve the display symbol for a currency code (e.g. USD -> "$", EUR -> "€").
 * Falls back to the raw code when Intl can't produce a distinct symbol.
 */
export function getCurrencySymbol(currency: string): string {
  const parts = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).formatToParts(0);
  return parts.find((part) => part.type === 'currency')?.value ?? currency;
}

/**
 * Format currency with abbreviated notation (K for thousands, M for millions)
 * @param amount - The amount to format
 * @param currency - Currency code (default: 'USD')
 * @returns Formatted string like "$1.2K" or "€3.45M"
 */
export function formatCurrencyAbbreviated(
  amount: number,
  currency?: string | null,
): string {
  const currencySymbol = getCurrencySymbol(currency || 'USD');
  const absoluteAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (absoluteAmount >= 1_000_000) {
    return `${sign}${currencySymbol}${(absoluteAmount / 1_000_000).toFixed(2)}M`;
  }
  if (absoluteAmount >= 1_000) {
    return `${sign}${currencySymbol}${(absoluteAmount / 1_000).toFixed(1)}K`;
  }
  return `${sign}${currencySymbol}${Math.round(absoluteAmount)}`;
}

export const formatDateToLocal = (
  dateStr: string,
  locale: string = 'en-US',
) => {
  const date = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  };
  const formatter = new Intl.DateTimeFormat(locale, options);
  return formatter.format(date);
};

export const generatePagination = (currentPage: number, totalPages: number) => {
  // If the total number of pages is 7 or less,
  // display all pages without any ellipsis.
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  // If the current page is among the first 3 pages,
  // show the first 3, an ellipsis, and the last 2 pages.
  if (currentPage <= 3) {
    return [1, 2, 3, '...', totalPages - 1, totalPages];
  }

  // If the current page is among the last 3 pages,
  // show the first 2, an ellipsis, and the last 3 pages.
  if (currentPage >= totalPages - 2) {
    return [1, 2, '...', totalPages - 2, totalPages - 1, totalPages];
  }

  // If the current page is somewhere in the middle,
  // show the first page, an ellipsis, the current page and its neighbors,
  // another ellipsis, and the last page.
  return [
    1,
    '...',
    currentPage - 1,
    currentPage,
    currentPage + 1,
    '...',
    totalPages,
  ];
};

export const formatDateToDateTime = (
  dateStr: string,
  locale: string = 'en-US',
) => {
  const date = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  };
  const formatter = new Intl.DateTimeFormat(locale, options);
  return formatter.format(date);
};

export function getCancelByDate(termEndDate: any, cancelByDateRange: any): any {
  if (!termEndDate || !cancelByDateRange) {
    return { cancelByDate: null, daysLeft: null };
  }

  const currentDate = new Date();
  const expireDate = parseISO(termEndDate);
  if (!expireDate) {
    return { cancelByDate: null, daysLeft: null };
  }
  const cancelByDate = sub(expireDate, {
    days: parseInt(String(cancelByDateRange)),
  });
  const daysLeft = differenceInDays(cancelByDate, currentDate);

  return { cancelByDate: format(cancelByDate, 'yyyy-MM-dd'), daysLeft };
}

export function getStartEndDates(dateParams: {
  month?: number;
  year?: number;
  quarter?: number;
}): { startDate: string; endDate: string } {
  const { month, year, quarter } = dateParams;
  if (month !== undefined && year !== undefined) {
    const startDate = formatDate(
      startOfMonth(new Date(year, month, 1)),
      'yyyy-MM-dd',
    );
    const endDate = formatDate(
      endOfMonth(new Date(year, month, 1)).toDateString(),
      'yyyy-MM-dd',
    );
    return { startDate, endDate };
  }

  if (quarter !== undefined && year !== undefined) {
    const quarterStartMonth = (quarter - 1) * 3;
    const startDate = formatDate(
      startOfMonth(new Date(year, quarterStartMonth, 1)),
      'yyyy-MM-dd',
    );
    const endDate = formatDate(
      endOfMonth(new Date(year, quarterStartMonth + 2, 1)),
      'yyyy-MM-dd',
    );
    return { startDate, endDate };
  }

  const startDate = formatDate(
    startOfMonth(parseISO(new Date().toDateString())),
    'yyyy-MM-dd',
  );
  const endDate = formatDate(endOfMonth(new Date()), 'yyyy-MM-dd');
  return { startDate, endDate };
}

export function getFiscalQuarter(date: string | Date | number): number {
  const month = getMonth(date);
  if (month < 3) return 4; // January - March
  if (month < 6) return 1; // April - June
  if (month < 9) return 2; // July - September
  return 3; // October - December
}

export const _DEFAULT_KNOWN_COMPANY_SUFFIXES = [
  'corp',
  'corporation',
  'inc',
  'incorporated',
  'llc',
  'ltd',
  'limited',
  'plc',
  'gmbh',
  'ag',
  'sas',
  'sarl',
  'lp',
  'llp',
  'co',
  'company',
  'liability',
  'international', // Kept for issue examples
  // Variants with periods that will be normalized for the lookup set
  'corp.',
  'inc.',
  'l.l.c.',
  'ltd.',
  'p.l.c.',
  'co.',
];
const KNOWN_COMPANY_SUFFIXES_SET = new Set(
  _DEFAULT_KNOWN_COMPANY_SUFFIXES.map((s) => s.replace(/\./g, '')),
);

/**
 * Normalizes a company name by converting it to lowercase, removing punctuation (except hyphens and apostrophes within words),
 * trimming whitespace, and attempting to remove common company suffixes.
 * If all words are suffixes, it retains the first word (normalized).
 * @param name - The company name string to normalize.
 * @returns The normalized company name string, or an empty string if the input is invalid or results in an empty string after processing.
 */
export function removeKnownSuffixes(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  // Unicode-aware: the previous [^a-z0-9\s'-] class deleted letters outright,
  // turning "BØRS" into "brs" and breaking vendor resolution for Nordic names.
  const currentName = toCompareKey(name);

  if (!currentName) {
    return '';
  }

  let words = currentName.split(' ');
  if (words.length === 0) {
    return currentName;
  }

  let numWordsToKeep = words.length;

  while (numWordsToKeep > 0) {
    const currentWordRaw = words[numWordsToKeep - 1];
    const wordForSuffixCheck = currentWordRaw.replace(/\./g, '');

    if (wordForSuffixCheck.length === 0) {
      break;
    }

    if (KNOWN_COMPANY_SUFFIXES_SET.has(wordForSuffixCheck)) {
      if (numWordsToKeep === 1 && words.length === 1) {
        words[0] = wordForSuffixCheck;
        break;
      } else {
        numWordsToKeep--;
      }
    } else {
      break;
    }
  }

  let finalWords = words.slice(0, numWordsToKeep);

  if (numWordsToKeep === 0 && words.length > 0) {
    finalWords = [words[0].replace(/\./g, '')];
  }

  finalWords = finalWords.map((w) => w.replace(/\.$/, ''));

  const result = finalWords.join(' ').trim();

  return result.length > 0 ? result : currentName;
}

export function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (!s1) return s2 ? s2.length : 0;
  if (!s2) return s1.length;

  const track = Array(s2.length + 1)
    .fill(null)
    .map(() => Array(s1.length + 1).fill(null));

  for (let i = 0; i <= s1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= s2.length; j += 1) {
    track[j][0] = j;
  }

  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator,
      );
    }
  }
  return track[s2.length][s1.length];
}

/**
 * Calculates the Jaccard index between two strings based on word sets.
 * The Jaccard index is a measure of similarity between two sets, calculated as the
 * size of the intersection divided by the size of the union of the sets.
 * Strings are converted to lowercase and split into words.
 * @param s1 - The first string.
 *  @param s2 - The second string.
 * @returns The Jaccard index (similarity score) between 0.0 and 1.0.
 * Returns 1.0 if both strings are empty or contain only whitespace after normalization.
 * Returns 0.0 if one string is empty (or whitespace) and the other is not.
 */
export function jaccardIndex(s1: string, s2: string): number {
  const words1 = s1.toLowerCase().split(/\s+/).filter(Boolean);
  const words2 = s2.toLowerCase().split(/\s+/).filter(Boolean);

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  if (set1.size === 0 && set2.size === 0) return 1.0;
  if (set1.size === 0 || set2.size === 0) return 0.0;

  let intersectionSize = 0;
  for (const item of Array.from(set1)) {
    if (set2.has(item as string)) {
      intersectionSize++;
    }
  }

  const unionSet = new Set(words1);
  for (const item of words2) {
    unionSet.add(item);
  }
  const unionSize = unionSet.size;

  if (unionSize === 0) return 1.0;

  return intersectionSize / unionSize;
}

/**
 * Calculates a similarity score between two vendor names.
 * It first normalizes the names using `removeKnownSuffixes`.
 * Then, it calculates the Levenshtein similarity (1 - normalized Levenshtein distance)
 * and the Jaccard index between the normalized names.
 * A combined score is computed using weighted averages of these two similarities.
 * @param name1 - The first vendor name.
 * @param name2 - The second vendor name.
 * @param weights - Optional weights for combining Levenshtein and Jaccard scores.
 *                  Defaults to `{ levenshtein: 0.7, jaccard: 0.3 }`.
 * @returns An object containing:
 *  - `levenshteinSimilarity`: The Levenshtein similarity score (0.0 to 1.0).
 *  - `jaccardSimilarity`: The Jaccard index (0.0 to 1.0).
 *  - `combinedScore`: The weighted combined similarity score.
 *  - `normalizedName1`: The first name after normalization.
 *  - `normalizedName2`: The second name after normalization.
 * Returns zeros for scores and original names as normalized if inputs are invalid.
 */
export function calculateVendorSimilarity(
  name1: string,
  name2: string,
  weights = { levenshtein: 0.7, jaccard: 0.3 },
): {
  levenshteinSimilarity: number;
  jaccardSimilarity: number;
  combinedScore: number;
  normalizedName1: string;
  normalizedName2: string;
} {
  if (!name1 || !name2) {
    return {
      levenshteinSimilarity: 0,
      jaccardSimilarity: 0,
      combinedScore: 0,
      normalizedName1: name1 || '',
      normalizedName2: name2 || '',
    };
  }

  const normalizedName1 = removeKnownSuffixes(name1);
  const normalizedName2 = removeKnownSuffixes(name2);

  if (
    normalizedName1 !== normalizedName2 &&
    toFoldKey(normalizedName1) === toFoldKey(normalizedName2) &&
    toFoldKey(normalizedName1) !== ''
  ) {
    return {
      levenshteinSimilarity: 1,
      jaccardSimilarity: 1,
      combinedScore: 1,
      normalizedName1,
      normalizedName2,
    };
  }

  const maxLength = Math.max(normalizedName1.length, normalizedName2.length);
  let levenshteinSim = 0;
  if (maxLength > 0) {
    const distance = levenshteinDistance(normalizedName1, normalizedName2);
    levenshteinSim = 1.0 - distance / maxLength;
  } else if (normalizedName1 === normalizedName2) {
    levenshteinSim = 1.0;
  }

  const jaccardSim = jaccardIndex(normalizedName1, normalizedName2);

  const combinedScore =
    levenshteinSim * weights.levenshtein + jaccardSim * weights.jaccard;

  return {
    levenshteinSimilarity: levenshteinSim,
    jaccardSimilarity: jaccardSim,
    combinedScore: combinedScore,
    normalizedName1: normalizedName1,
    normalizedName2: normalizedName2,
  };
}

export const formatAIExtraction = (extraction: any) => {
  if (!extraction) return {};

  return {
    vendor_name: extraction.vendor_name,
    contract_type: extraction.contract_type,
    contract_value: extraction.contract_value,
    products_list: extraction.products_list,
    products_fees: extraction.products_fees,
    permissions: extraction.permissions,
    payment_terms: extraction.payment_terms,
    scope_of_use: extraction.scope_of_use,
    suspension_of_service: extraction.suspension_of_service,
    renewal_period: extraction.renewal_period,
    cancellation_process: extraction.cancellation_process,
    marketing_rights: extraction.marketing_rights,
    cancel_by_date: extraction.cancel_by_date,
    subscription_term: extraction.subscription_term,
    billing_frequency: extraction.billing_frequency,
    annual_increase: extraction.annual_increase,
    currency: extraction.currency,
    geo_restrictions: extraction.geo_restrictions,
    distribution_rights: extraction.distribution_rights,
    term_start_date: extraction.term_start_date,
    term_end_date: extraction.term_end_date,
    execution_date: extraction.execution_date,
    multi_year: extraction.multi_year,
    auto_renewal: extraction.auto_renewal,
  };
};

export function getFiscalYearDisplay(
  fiscalYearStart?: number,
  currentDate: Date = new Date(),
  datePattern?: string,
): {
  currentYear: string;
  nextYear: string;
  currentDateRange: string;
  nextDateRange: string;
  currentDescriptive: string;
  nextDescriptive: string;
} {
  const start = fiscalYearStart ?? 1;
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const normalizedStart = ((start - 1 + 12) % 12) + 1;

  const formatRangeDate = (date: Date) =>
    datePattern ? format(date, datePattern) : date.toLocaleDateString('en-US');

  const calculateFiscalYear = (baseYear: number) => {
    const startMonth = new Date(baseYear, normalizedStart - 1, 1);
    const endMonth = new Date(baseYear + 1, normalizedStart - 1, 0);
    const fyEndYear = endMonth.getFullYear();

    return {
      year: `FY${fyEndYear}`,
      dateRange: `${formatRangeDate(startMonth)} - ${formatRangeDate(endMonth)}`,
      descriptive: `Fiscal Year Ending ${months[endMonth.getMonth()]} ${endMonth.getDate()}, ${fyEndYear}`,
    };
  };

  let currentStartYear = currentDate.getFullYear();
  if (currentDate.getMonth() + 1 < normalizedStart) {
    currentStartYear -= 1;
  }

  const currentFY = calculateFiscalYear(currentStartYear);
  const nextFY = calculateFiscalYear(currentStartYear + 1);

  return {
    currentYear: currentFY.year,
    nextYear: nextFY.year,
    currentDateRange: currentFY.dateRange,
    nextDateRange: nextFY.dateRange,
    currentDescriptive: currentFY.descriptive,
    nextDescriptive: nextFY.descriptive,
  };
}

// Conditional sorting

function getNestedValue(row: ContractTableRow, accessor: string): any {
  const keys = accessor.split('.');
  let value: any = row;
  for (const key of keys) {
    if (value === null || value === undefined) return undefined;
    value = value[key as keyof typeof value];
  }
  return value;
}

export const customTotalContractValueSort = (rowA: any, rowB: any) => {
  // Get values consistently
  const valueA =
    typeof rowA.original.totalContractValue === 'number'
      ? rowA.original.totalContractValue
      : 0;

  const valueB =
    typeof rowB.original.totalContractValue === 'number'
      ? rowB.original.totalContractValue
      : 0;

  // Simple numeric comparison
  return valueA - valueB;
};

export const conditionalSort: SortingFn<ContractTableRow> = (
  rowA,
  rowB,
  columnId,
) => {
  // For totalContractValue, we need to sort all rows (grouped and individual) together
  // based on their actual values without caring about row types
  if (columnId === 'totalContractValue') {
    // Helper function to extract the numerical TCV value for sorting
    const getTCVValue = (row: any): number => {
      // Special case - if this is a vendor row with isGroup=true (grouped by vendor)
      if (row.original.isGroup === true) {
        // Get sum of all subrows
        let sum = 0;
        if (row.subRows?.length > 0) {
          // Sum direct subrow values
          sum = row.subRows.reduce((acc: number, subRow: any) => {
            const subValue = Number(subRow.original.totalContractValue) || 0;
            return acc + subValue;
          }, 0);
        } else if (row.original.subRows?.length > 0) {
          // Sum from original subrows
          sum = row.original.subRows.reduce((acc: number, subRow: any) => {
            const subValue = Number(subRow.totalContractValue) || 0;
            return acc + subValue;
          }, 0);
        }
        return sum;
      }

      // For regular rows, just use the direct value
      const directValue = Number(row.original.totalContractValue) || 0;
      return directValue;
    };

    // Get the TCV values
    const aValue = getTCVValue(rowA);
    const bValue = getTCVValue(rowB);

    // For debugging
    // logger.debug(`Comparing: ${aValue} vs ${bValue} - isGroup A: ${rowA.original.isGroup}, isGroup B: ${rowB.original.isGroup}`, { aValue, bValue, isGroupA: rowA.original.isGroup, isGroupB: rowB.original.isGroup });

    // Simple numeric comparison, ignoring row types
    return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
  }

  // For other columns, use the standard behavior

  // Helper function to get value for a row, with fallback to first subrow if needed
  const getValue = (row: any, columnId: string) => {
    let value = getNestedValue(row.original, columnId);

    // If value is null/undefined and the row has subrows, get value from first subrow
    if (
      (value === null || value === undefined) &&
      ((row.original.subRows && row.original.subRows.length > 0) ||
        (row.subRows && row.subRows.length > 0))
    ) {
      // Try to get from row.original.subRows first (for grouped data structure)
      if (row.original.subRows && row.original.subRows.length > 0) {
        value = getNestedValue(row.original.subRows[0], columnId);
      }

      // If still no value, try from row.subRows (tanstack/react-table structure)
      if (
        (value === null || value === undefined) &&
        row.subRows &&
        row.subRows.length > 0
      ) {
        value = getNestedValue(row.subRows[0].original, columnId);
      }
    }

    return value;
  };

  const aValue = getValue(rowA, columnId);
  const bValue = getValue(rowB, columnId);

  // Handle null/undefined values
  if (aValue === null && bValue === null) return 0;
  if (aValue === null) return 1;
  if (bValue === null) return -1;

  // Compare values based on their types
  if (typeof aValue === 'string' && typeof bValue === 'string') {
    return aValue.localeCompare(bValue);
  } else {
    return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
  }
};

export async function handleDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export const getDurationMins = (startTime: number, endTime: number) => {
  return Number(((endTime - startTime) / 60000).toFixed(2));
};

export const getDurationSeconds = (startTime: number, endTime: number) => {
  return Number(((endTime - startTime) / 1000).toFixed(2));
};

export const getHash = (hashString: string) => {
  return crypto.createHash('sha256').update(hashString).digest('hex');
};

export const calculateResults = (results: any[]) => {
  return results.reduce((acc, cur) => {
    if (!cur) return acc;
    Object.keys(cur).forEach((key) => {
      if (key === 'data') return;
      if (!acc[key]) acc[key] = 0;
      acc[key] += cur[key];
    });
    return acc;
  }, {});
};

export function getProductsByYear(data: any, contract?: any) {
  if (!data?.vendor_products_details) return {};

  // Use the budget module's groupProductsByYear if available
  // This is a forward-compatible way to handle this without requiring imports yet
  try {
    // Import dynamically at runtime
    const { isContractRenewed } = require('./budget/contractStatusUtils');
    const {
      groupProductsByYear,
    } = require('./budget/productSelectionStrategy');

    // Use the enhanced version with contract renewal handling
    if (contract && isContractRenewed(contract)) {
      const productsMap = groupProductsByYear(
        data.vendor_products_details,
        contract,
      );

      // Convert Map back to object format for compatibility
      const result: any = {};
      productsMap.forEach((products: any, year: any) => {
        result[year] = products;
      });
      return result;
    }
  } catch (e) {
    // If imports fail, fall back to original implementation
    logger.warn({ error: e }, 'Falling back to basic product grouping');
  }

  // Original implementation as fallback
  return data.vendor_products_details.reduce((acc: any, product: any) => {
    if (!acc[product.year]) {
      acc[product.year] = [];
    }
    acc[product.year].push(product);
    return acc;
  }, {});
}

export function calculateChange(
  currentValue: number,
  newValue: number,
): {
  amount: number;
  percentage: number;
  isIncrease: boolean;
} {
  // Handle edge case of current value being 0
  if (currentValue === 0) {
    return {
      amount: newValue,
      percentage: newValue === 0 ? 0 : 100,
      isIncrease: newValue > 0,
    };
  }

  const amount = Math.round(newValue - currentValue);
  const multiplier = Math.pow(10, 1);
  const percentage =
    Math.round(
      ((newValue - currentValue) / Math.abs(currentValue)) * 100 * multiplier,
    ) / multiplier;

  return {
    amount,
    percentage,
    isIncrease: newValue >= currentValue,
  };
}

export function formatNumberOfMonths(months: number | string | null): string {
  if (!months) return '';

  // Convert to number if it's a string
  const monthsNum = typeof months === 'string' ? parseInt(months) : months;

  if (isNaN(monthsNum)) return '';

  const years = Math.floor(monthsNum / 12);
  const remainingMonths = monthsNum % 12;

  if (years === 0) return `${monthsNum} Month${monthsNum !== 1 ? 's' : ''}`;
  if (remainingMonths === 0) return `${years} Year${years !== 1 ? 's' : ''}`;
  return `${years} Year${years !== 1 ? 's' : ''} ${remainingMonths} Month${remainingMonths !== 1 ? 's' : ''}`;
}

/**
 * Utility function to calculate days until a given date
 * Returns the number of days until the date, or Infinity if date is invalid
 */
export function getDaysUntilDate(date: string | Date | null): number {
  if (!date) return Infinity;
  const parsedDate = date instanceof Date ? date : new Date(date);
  if (isNaN(parsedDate.getTime())) return Infinity;

  return Math.ceil(
    (parsedDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
  );
}

/** Normalize and validate an external URL
 * Ensures the URL starts with http:// or https://
 * If no scheme is present, defaults to https://
 * Returns undefined for empty or invalid URLs
 */
export function normaliseExternalUrl(url: string): string | undefined {
  if (!url || url.trim() === '') return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('://')) {
    logger.warn({ url }, 'Unexpected URL protocol in TOS URL');
    return undefined;
  }
  return `https://${url}`;
}

export function calculateSimilarity(name1: string, name2: string): number {
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();
  const maxLen = Math.max(n1.length, n2.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(n1, n2) / maxLen;
}
