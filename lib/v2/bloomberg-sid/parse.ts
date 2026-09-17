import { parse } from 'csv-parse/sync';
import type {
  ParsedSidFileSet,
  SidAccountRow,
  SidChangeRow,
  SidExchangeFeeRow,
  SidFileIndex,
  SidMaterialChargeRow,
  SidResearchPurchaseRow,
  SidSubscriptionRow,
} from './types';

export class SidParseError extends Error {}

const CHANGE_HEADER = [
  'Cust Num',
  'Date',
  'Time',
  'Start',
  'Stop',
  'SID',
  'SID Inst Num',
  'Order Num',
  'Line',
  'Type Description',
  'Code',
  'Description',
  'PO Number',
  'Special',
  'From Cust Num',
  'From Completion Date',
  'To Cust Num',
  'To Completion Date',
];

const EXCHANGE_HEADER = [
  'Cust Num',
  'Rpt Month',
  'Exchange',
  'Name',
  'Subscriptions',
  'Currency',
  'Total Price',
  'Contributor Bills',
  'Pro Rate',
  'Contributor Bills',
  'SID',
  'SID Inst Num',
];

// File -0 ends in an unnamed column (the billing date).
export const SID_FILE_HEADERS: Record<SidFileIndex, string[]> = {
  0: [
    'Cust Num',
    'Name',
    'New Cust',
    'City',
    'State',
    'Ctry',
    'Curr',
    'Tax',
    'Auto',
    'Term',
    '',
  ],
  1: CHANGE_HEADER,
  2: [
    'Cust Num',
    'SID',
    'SID Inst Num',
    'Contract Date',
    'Renewal Date',
    'Last User',
    'SID Type',
    'SID Description',
    'GPTT',
    'GPTT Description',
    'SN/UUID',
    'WS',
    '90 Day',
    'Special',
    'Price',
    'Dual Inst Num',
    'Dual Cust Num',
    'PO Number',
  ],
  3: EXCHANGE_HEADER,
  4: [...EXCHANGE_HEADER, 'EID Number'],
  5: [
    'Cust Num',
    'Rpt Month',
    'Research report ID',
    'Research Report Title',
    'Research report publish date',
    'Analyst name',
    'Research asset class',
    'Industry',
    'Region',
    'Price per document',
    'Volume purchased',
    'Transaction date',
    'Transaction ID',
    'Consumer Company name',
    'Consumer company number',
    'Purchaser Name',
    'UUID of Purchaser',
    'Research class name',
    'Memo',
  ],
  6: [
    'Cust Num',
    'Rpt Month',
    'Quantity',
    'Material',
    'Description',
    'Total Price',
    'Currency',
    'StartDate',
    'EndDate',
    'Username',
  ],
  7: [
    ...CHANGE_HEADER,
    'Subscription Billthru Date',
    'Subscription Related SID',
    'Subscription Related Inst Num',
    'Subscription Related Cust Num',
    'Subscription Amount',
    'Hardware Billthru Date',
    'Hardware Related SID',
    'Hardware Related Inst Num',
    'Hardware Related Cust Num',
    'Hardware Amount',
  ],
};

const NO_CHANGE_ACTIVITY = 'No Subscription Change Activity';
const NO_EXCHANGES = 'No Exchanges';
const ADMIN_FEES_HEADER = 'Exchange Administration Fees';

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

// latin1 would turn a UTF-8 BOM into three visible characters on the header.
function stripBom(buffer: Buffer): Buffer {
  return buffer.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)
    ? buffer.subarray(UTF8_BOM.length)
    : buffer;
}

/**
 * Data records of one SID file, header verified and dropped. Files are
 * NUL-padded to 1 KiB blocks; the -2 file may arrive `;`-delimited.
 */
export function readSidRecords(
  buffer: Buffer,
  fileIndex: SidFileIndex,
): string[][] {
  const text = stripBom(buffer).toString('latin1').replace(/\0/g, '');
  const firstLineEnd = text.indexOf('\n');
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const delimiter = count(firstLine, ';') > count(firstLine, ',') ? ';' : ',';
  const records = parse(text, {
    delimiter,
    relax_column_count: true,
    skip_empty_lines: true,
    bom: true,
  }) as string[][];
  const [header = [], ...rows] = records;
  const expected = SID_FILE_HEADERS[fileIndex];
  const actual = header.map((h) => h.trim());
  if (
    actual.length !== expected.length ||
    actual.some((h, i) => h !== expected[i])
  ) {
    throw new SidParseError(
      `File -${fileIndex}: unexpected header ${JSON.stringify(actual)}`,
    );
  }
  return rows.filter((row) => row.some((cell) => cell.trim() !== ''));
}

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

function req(value: string | undefined, label: string): string {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') throw new SidParseError(`${label}: empty`);
  return trimmed;
}

/** Empty and `?` both mean "not applicable" in these files. */
function opt(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' || trimmed === '?' ? null : trimmed;
}

function int(value: string | undefined, label: string): number {
  const trimmed = req(value, label);
  if (!/^-?\d+$/.test(trimmed)) {
    throw new SidParseError(`${label}: not an integer "${trimmed}"`);
  }
  return Number(trimmed);
}

function optInt(value: string | undefined, label: string): number | null {
  const trimmed = opt(value);
  return trimmed === null ? null : int(trimmed, label);
}

const PLAIN_DECIMAL = /^-?(\d+(\.\d+)?|\.\d+)$/;
const GROUPED_DECIMAL = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;

// A comma is only ever a thousands separator here; `2360,50` would otherwise
// read as 236050.
function decimal(value: string | undefined, label: string): number {
  const trimmed = req(value, label);
  const digits = GROUPED_DECIMAL.test(trimmed)
    ? trimmed.replace(/,/g, '')
    : trimmed;
  if (!PLAIN_DECIMAL.test(digits)) {
    throw new SidParseError(`${label}: not a number "${trimmed}"`);
  }
  return Number(digits);
}

/** `***` = Bloomberg passes the line through without charging. */
function money(value: string | undefined, label: string): number | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '' || trimmed === '?' || trimmed === '***') return null;
  return decimal(trimmed, label);
}

function wholeNumber(value: string | undefined, label: string): number {
  const parsed = decimal(value, label);
  if (!Number.isInteger(parsed)) {
    throw new SidParseError(`${label}: not a whole number "${value}"`);
  }
  return parsed;
}

function flag(value: string | undefined, label: string): boolean {
  const trimmed = (value ?? '').trim();
  if (trimmed === '*') return true;
  if (trimmed === '') return false;
  throw new SidParseError(`${label}: unexpected flag "${trimmed}"`);
}

function yesNo(value: string | undefined, label: string): boolean {
  const trimmed = req(value, label).toLowerCase();
  if (trimmed === 'yes') return true;
  if (trimmed === 'no') return false;
  throw new SidParseError(`${label}: expected Yes/No, got "${value}"`);
}

const MDY = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;
const DMY = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const TWO_DIGIT_YEAR_PIVOT = 50;

const fullYear = (yy: number): number =>
  yy < TWO_DIGIT_YEAR_PIVOT ? 2000 + yy : 1900 + yy;

/** Accepts MM/DD/YY, MM/DD/YYYY and DD.MM.YYYY; returns YYYY-MM-DD. */
function isoDate(value: string | undefined, label: string): string {
  const trimmed = req(value, label);
  const mdy = MDY.exec(trimmed);
  const dmy = DMY.exec(trimmed);
  let year: number;
  let month: number;
  let day: number;
  if (mdy) {
    month = Number(mdy[1]);
    day = Number(mdy[2]);
    year = mdy[3].length === 2 ? fullYear(Number(mdy[3])) : Number(mdy[3]);
  } else if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else {
    throw new SidParseError(`${label}: unparseable date "${trimmed}"`);
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new SidParseError(`${label}: invalid date "${trimmed}"`);
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function optDate(value: string | undefined, label: string): string | null {
  const trimmed = opt(value);
  return trimmed === null ? null : isoDate(trimmed, label);
}

function time(value: string | undefined, label: string): string {
  const trimmed = req(value, label);
  if (!/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    throw new SidParseError(`${label}: unparseable time "${trimmed}"`);
  }
  return trimmed;
}

function expectWidth(row: string[], width: number, label: string): void {
  if (row.length !== width) {
    throw new SidParseError(
      `${label}: expected ${width} columns, got ${row.length}: ${JSON.stringify(row)}`,
    );
  }
}

export function parseAccounts(records: string[][]): {
  billingDate: string;
  accounts: SidAccountRow[];
} {
  const billingDates = new Set<string>();
  const accounts = records.map((row, i) => {
    const label = `File -0 row ${i + 1}`;
    expectWidth(row, 11, label);
    billingDates.add(isoDate(row[10], `${label} billing date`));
    return {
      cust_num: int(row[0], `${label} Cust Num`),
      name: req(row[1], `${label} Name`),
      firmwide_id: int(row[2], `${label} New Cust`),
      city: req(row[3], `${label} City`),
      state: opt(row[4]),
      country: req(row[5], `${label} Ctry`),
      currency_code: req(row[6], `${label} Curr`),
      tax_rate: decimal(row[7], `${label} Tax`),
      auto: int(row[8], `${label} Auto`),
      term: int(row[9], `${label} Term`),
    };
  });
  if (billingDates.size !== 1) {
    throw new SidParseError(
      `File -0: expected one billing date, got ${[...billingDates].join(', ')}`,
    );
  }
  const [billingDate] = billingDates;
  return { billingDate, accounts };
}

export function parseSubscriptions(records: string[][]): SidSubscriptionRow[] {
  return records.map((row, i) => {
    const label = `File -2 row ${i + 1}`;
    expectWidth(row, 18, label);
    return {
      cust_num: int(row[0], `${label} Cust Num`),
      sid: int(row[1], `${label} SID`),
      sid_inst_num: int(row[2], `${label} SID Inst Num`),
      contract_date: isoDate(row[3], `${label} Contract Date`),
      renewal_date: isoDate(row[4], `${label} Renewal Date`),
      last_user: req(row[5], `${label} Last User`),
      sid_type: int(row[6], `${label} SID Type`),
      sid_description: req(row[7], `${label} SID Description`),
      gptt: int(row[8], `${label} GPTT`),
      gptt_description: req(row[9], `${label} GPTT Description`),
      serial_number: req(row[10], `${label} SN/UUID`),
      ws: optInt(row[11], `${label} WS`),
      ninety_day: flag(row[12], `${label} 90 Day`),
      special: opt(row[13]),
      price: decimal(row[14], `${label} Price`),
      dual_inst_num: optInt(row[15], `${label} Dual Inst Num`),
      dual_cust_num: optInt(row[16], `${label} Dual Cust Num`),
      po_number: opt(row[17]),
    };
  });
}

export function parseChanges(records: string[][]): SidChangeRow[] {
  const changes: SidChangeRow[] = [];
  records.forEach((row, i) => {
    const label = `File -7 row ${i + 1}`;
    if (row.length === 2) {
      if (row[1].trim() !== NO_CHANGE_ACTIVITY) {
        throw new SidParseError(`${label}: unexpected marker "${row[1]}"`);
      }
      return;
    }
    expectWidth(row, 28, label);
    changes.push({
      cust_num: int(row[0], `${label} Cust Num`),
      activity_date: isoDate(row[1], `${label} Date`),
      activity_time: time(row[2], `${label} Time`),
      is_start: yesNo(row[3], `${label} Start`),
      is_stop: yesNo(row[4], `${label} Stop`),
      sid: int(row[5], `${label} SID`),
      sid_inst_num: int(row[6], `${label} SID Inst Num`),
      order_num: int(row[7], `${label} Order Num`),
      line: int(row[8], `${label} Line`),
      type_description: req(row[9], `${label} Type Description`),
      code: int(row[10], `${label} Code`),
      description: req(row[11], `${label} Description`),
      po_number: opt(row[12]),
      special: opt(row[13]),
      from_cust_num: optInt(row[14], `${label} From Cust Num`),
      from_completion_date: optDate(row[15], `${label} From Completion Date`),
      to_cust_num: optInt(row[16], `${label} To Cust Num`),
      to_completion_date: optDate(row[17], `${label} To Completion Date`),
      subscription_billthru_date: optDate(
        row[18],
        `${label} Subscription Billthru Date`,
      ),
      subscription_related_sid: optInt(
        row[19],
        `${label} Subscription Related SID`,
      ),
      subscription_related_inst_num: optInt(
        row[20],
        `${label} Subscription Related Inst Num`,
      ),
      subscription_related_cust_num: optInt(
        row[21],
        `${label} Subscription Related Cust Num`,
      ),
      subscription_amount: money(row[22], `${label} Subscription Amount`),
      hardware_billthru_date: optDate(
        row[23],
        `${label} Hardware Billthru Date`,
      ),
      hardware_related_sid: optInt(row[24], `${label} Hardware Related SID`),
      hardware_related_inst_num: optInt(
        row[25],
        `${label} Hardware Related Inst Num`,
      ),
      hardware_related_cust_num: optInt(
        row[26],
        `${label} Hardware Related Cust Num`,
      ),
      hardware_amount: money(row[27], `${label} Hardware Amount`),
    });
  });
  return changes;
}

/**
 * File -4 is hierarchical by row width: 8 = exchange summary, 13 = one SID
 * under the most recent summary, 6 = administration fee, 2 = section marker.
 */
export function parseExchangeFees(records: string[][]): SidExchangeFeeRow[] {
  const fees: SidExchangeFeeRow[] = [];
  let current: SidExchangeFeeRow | null = null;
  records.forEach((row, i) => {
    const label = `File -4 row ${i + 1}`;
    switch (row.length) {
      case 2: {
        const marker = row[1].trim();
        if (marker !== NO_EXCHANGES && marker !== ADMIN_FEES_HEADER) {
          throw new SidParseError(`${label}: unexpected marker "${marker}"`);
        }
        current = null;
        return;
      }
      case 8: {
        current = {
          cust_num: int(row[0], `${label} Cust Num`),
          rpt_month: isoDate(row[1], `${label} Rpt Month`),
          fee_kind: 'exchange',
          exchange_code: req(row[2], `${label} Exchange`),
          exchange_name: req(row[3], `${label} Name`),
          subscriptions: wholeNumber(row[4], `${label} Subscriptions`),
          currency_code: req(row[5], `${label} Currency`),
          total_price: money(row[6], `${label} Total Price`),
          contributor_bills: flag(row[7], `${label} Contributor Bills`),
          lines: [],
        };
        fees.push(current);
        return;
      }
      case 6: {
        fees.push({
          cust_num: int(row[0], `${label} Cust Num`),
          rpt_month: isoDate(row[1], `${label} Rpt Month`),
          fee_kind: 'admin',
          exchange_code: req(row[2], `${label} Exchange`),
          exchange_name: req(row[3], `${label} Name`),
          subscriptions: wholeNumber(row[4], `${label} Subscriptions`),
          currency_code: null,
          total_price: money(row[5], `${label} Total Price`),
          contributor_bills: false,
          lines: [],
        });
        current = null;
        return;
      }
      case 13: {
        if (!current) {
          throw new SidParseError(`${label}: SID line without an exchange row`);
        }
        const custNum = int(row[0], `${label} Cust Num`);
        const rptMonth = isoDate(row[1], `${label} Rpt Month`);
        const exchangeCode = req(row[2], `${label} Exchange`);
        if (
          custNum !== current.cust_num ||
          rptMonth !== current.rpt_month ||
          exchangeCode !== current.exchange_code
        ) {
          throw new SidParseError(
            `${label}: SID line does not belong to ${current.exchange_code}`,
          );
        }
        current.lines.push({
          sid: int(row[10], `${label} SID`),
          sid_inst_num: int(row[11], `${label} SID Inst Num`),
          pro_rate: money(row[8], `${label} Pro Rate`),
          contributor_bills: flag(row[9], `${label} Contributor Bills`),
          eid_number: int(row[12], `${label} EID Number`),
        });
        return;
      }
      default:
        throw new SidParseError(
          `${label}: unexpected width ${row.length}: ${JSON.stringify(row)}`,
        );
    }
  });
  return fees;
}

export function parseResearchPurchases(
  records: string[][],
): SidResearchPurchaseRow[] {
  return records.map((row, i) => {
    const label = `File -5 row ${i + 1}`;
    expectWidth(row, 19, label);
    return {
      cust_num: int(row[0], `${label} Cust Num`),
      rpt_month: optDate(row[1], `${label} Rpt Month`),
      research_report_id: opt(row[2]),
      title: opt(row[3]),
      publish_date: optDate(row[4], `${label} publish date`),
      analyst_name: opt(row[5]),
      asset_class: opt(row[6]),
      industry: opt(row[7]),
      region: opt(row[8]),
      price_per_document: money(row[9], `${label} Price per document`),
      volume_purchased: optInt(row[10], `${label} Volume purchased`),
      transaction_date: optDate(row[11], `${label} Transaction date`),
      transaction_id: opt(row[12]),
      consumer_company_name: opt(row[13]),
      consumer_company_number: optInt(
        row[14],
        `${label} Consumer company number`,
      ),
      purchaser_name: opt(row[15]),
      purchaser_uuid: opt(row[16]),
      research_class_name: opt(row[17]),
      memo: opt(row[18]),
    };
  });
}

export function parseMaterialCharges(
  records: string[][],
): SidMaterialChargeRow[] {
  return records.map((row, i) => {
    const label = `File -6 row ${i + 1}`;
    expectWidth(row, 10, label);
    return {
      cust_num: int(row[0], `${label} Cust Num`),
      rpt_month: optDate(row[1], `${label} Rpt Month`),
      quantity: optInt(row[2], `${label} Quantity`),
      material: opt(row[3]),
      description: opt(row[4]),
      total_price: money(row[5], `${label} Total Price`),
      currency_code: opt(row[6]),
      start_date: optDate(row[7], `${label} StartDate`),
      end_date: optDate(row[8], `${label} EndDate`),
      username: opt(row[9]),
    };
  });
}

/**
 * Parses one month's eight files. -1 and -3 are read only to verify their
 * header and count their rows: -7 and -4 carry the same rows plus more.
 */
export function parseSidFileSet(
  files: Record<SidFileIndex, Buffer>,
): ParsedSidFileSet {
  const records = {} as Record<SidFileIndex, string[][]>;
  for (const index of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
    records[index] = readSidRecords(files[index], index);
  }
  const { billingDate, accounts } = parseAccounts(records[0]);
  const firmwideIds = new Set(accounts.map((a) => a.firmwide_id));
  if (firmwideIds.size !== 1) {
    throw new SidParseError(
      `File -0: expected one firmwide ID, got ${[...firmwideIds].join(', ')}`,
    );
  }
  const [firmwideId] = firmwideIds;
  return {
    firmwideId,
    billingDate,
    accounts,
    subscriptions: parseSubscriptions(records[2]),
    changes: parseChanges(records[7]),
    exchangeFees: parseExchangeFees(records[4]),
    researchPurchases: parseResearchPurchases(records[5]),
    materialCharges: parseMaterialCharges(records[6]),
    rowCounts: {
      0: records[0].length,
      1: records[1].length,
      2: records[2].length,
      3: records[3].length,
      4: records[4].length,
      5: records[5].length,
      6: records[6].length,
      7: records[7].length,
    },
  };
}
