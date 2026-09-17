import type { OrgUnitTreeLevel } from '@/lib/v2/org-units/levels';

export type SidKey = `${number}:${number}`;

export const sidKey = (sid: number, sidInstNum: number): SidKey =>
  `${sid}:${sidInstNum}`;

export interface SidReportMonth {
  reportId: number;
  /** `yyyy-MM-dd`, first of the activity month. */
  reportMonth: string;
  /** `yyyy-MM-dd`, first of the following month. */
  billingDate: string;
}

export interface SidAccount {
  custNum: number;
  name: string;
  city: string;
  state: string | null;
  country: string;
  currencyCode: string;
  taxRate: number;
  auto: number;
  term: number;
}

export interface SidSubscription {
  custNum: number;
  sid: number;
  sidInstNum: number;
  contractDate: string;
  renewalDate: string;
  lastUser: string;
  sidType: number;
  sidDescription: string;
  gptt: number;
  gpttDescription: string;
  serialNumber: string;
  ws: number | null;
  ninetyDay: boolean;
  special: string | null;
  price: number;
  poNumber: string | null;
}

export interface SidExchangeFee {
  id: number;
  custNum: number;
  rptMonth: string;
  feeKind: 'exchange' | 'admin';
  exchangeCode: string;
  exchangeName: string;
  subscriptions: number;
  currencyCode: string | null;
  /** null = masked (`***`): the exchange bills the client directly. */
  totalPrice: number | null;
  contributorBills: boolean;
}

export interface SidExchangeFeeLine {
  feeId: number;
  sid: number;
  sidInstNum: number;
  /** null = masked. */
  proRate: number | null;
  contributorBills: boolean;
  eidNumber: number;
}

/** One imported month's rows behind the seat population. */
export interface SidSeatSource {
  /** `yyyy-MM-dd`, first of the activity month. */
  reportMonth: string;
  accounts: SidAccount[];
  subscriptions: SidSubscription[];
  fees: SidExchangeFee[];
  feeLines: SidExchangeFeeLine[];
}

/** One firmwide account's data for one imported month, as plain JSON. */
export interface SidReport {
  firmwideId: number;
  vendorId: number;
  /** Every imported month for the firmwide account, ascending. */
  months: SidReportMonth[];
  selected: SidReportMonth;
  accounts: SidAccount[];
  subscriptions: SidSubscription[];
  fees: SidExchangeFee[];
  feeLines: SidExchangeFeeLine[];
  /** Seats present in the previous imported month; null when none is imported. */
  previousSidKeys: SidKey[] | null;
  /** Keyed by `subscriptions.lastUser`; every distinct value has an entry. */
  hrMatches: Record<string, SidHrMatch>;
  /** The eight uploaded files of the selected month, by file index. */
  files: SidReportFile[];
}

export type SidHrConfidence = 'Exact name' | 'Fuzzy name' | 'Missing HR match';

export type SidUnitPath = Partial<Record<OrgUnitTreeLevel, string>>;

export interface SidHrEmployee {
  id: number;
  firstName: string;
  lastName: string;
  department: string | null;
  costCenter: string | null;
  orgUnitId: number | null;
  status: string;
}

export interface SidHrMatch {
  confidence: SidHrConfidence;
  employee: {
    id: number;
    fullName: string;
    department: string | null;
    costCenter: string | null;
    status: string;
    unitPath: SidUnitPath;
  } | null;
}

export interface SidReportFile {
  fileIndex: number;
  fileName: string;
  byteSize: number;
  rowCount: number;
  sha256: string;
  /** Short-lived download URL; null when the object could not be signed. */
  signedUrl: string | null;
  /** Signed URL with an attachment disposition; null when signing failed. */
  downloadUrl: string | null;
}

/** One seat of a product: the name on it, and the vendor's verdict on its use. */
export interface SidProductHolder {
  name: string;
  /** The report's 90-day flag: nobody has used this seat in that time. */
  dormant: boolean;
}

export interface SidProductSummary {
  gptt: number;
  description: string;
  seats: number;
  /** The month's terminal prices, summed. */
  monthlyCost: number;
  /** The month's known exchange pro-rates on the product's seats, summed. */
  entitlementsCost: number;
  /** Seats carrying at least one priced exchange line. */
  entitledSeats: number;
  /** `yyyy-MM-dd` of the report the figures come from. */
  reportMonth: string;
  /**
   * One entry per seat of the product, sorted by name. A name repeats when
   * one person holds several.
   */
  holders: SidProductHolder[];
  /** `yyyy-MM-dd`, the earliest contract date among the product's seats. */
  earliestContractDate: string;
  /** `yyyy-MM-dd`, the latest renewal date among the product's seats. */
  latestRenewalDate: string;
}
