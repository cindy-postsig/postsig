export type SidFileIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Field names match the bloomberg_sid_* columns so rows insert as-is. */

export type SidAccountRow = {
  cust_num: number;
  name: string;
  firmwide_id: number;
  city: string;
  state: string | null;
  country: string;
  currency_code: string;
  tax_rate: number;
  auto: number;
  term: number;
};

export type SidSubscriptionRow = {
  cust_num: number;
  sid: number;
  sid_inst_num: number;
  contract_date: string;
  renewal_date: string;
  last_user: string;
  sid_type: number;
  sid_description: string;
  gptt: number;
  gptt_description: string;
  serial_number: string;
  ws: number | null;
  ninety_day: boolean;
  special: string | null;
  price: number;
  dual_inst_num: number | null;
  dual_cust_num: number | null;
  po_number: string | null;
};

export type SidChangeRow = {
  cust_num: number;
  activity_date: string;
  activity_time: string;
  is_start: boolean;
  is_stop: boolean;
  sid: number;
  sid_inst_num: number;
  order_num: number;
  line: number;
  type_description: string;
  code: number;
  description: string;
  po_number: string | null;
  special: string | null;
  from_cust_num: number | null;
  from_completion_date: string | null;
  to_cust_num: number | null;
  to_completion_date: string | null;
  subscription_billthru_date: string | null;
  subscription_related_sid: number | null;
  subscription_related_inst_num: number | null;
  subscription_related_cust_num: number | null;
  subscription_amount: number | null;
  hardware_billthru_date: string | null;
  hardware_related_sid: number | null;
  hardware_related_inst_num: number | null;
  hardware_related_cust_num: number | null;
  hardware_amount: number | null;
};

export type SidExchangeFeeLineRow = {
  sid: number;
  sid_inst_num: number;
  pro_rate: number | null;
  contributor_bills: boolean;
  eid_number: number;
};

export type SidExchangeFeeRow = {
  cust_num: number;
  rpt_month: string;
  fee_kind: 'exchange' | 'admin';
  exchange_code: string;
  exchange_name: string;
  subscriptions: number;
  currency_code: string | null;
  total_price: number | null;
  contributor_bills: boolean;
  lines: SidExchangeFeeLineRow[];
};

export type SidResearchPurchaseRow = {
  cust_num: number;
  rpt_month: string | null;
  research_report_id: string | null;
  title: string | null;
  publish_date: string | null;
  analyst_name: string | null;
  asset_class: string | null;
  industry: string | null;
  region: string | null;
  price_per_document: number | null;
  volume_purchased: number | null;
  transaction_date: string | null;
  transaction_id: string | null;
  consumer_company_name: string | null;
  consumer_company_number: number | null;
  purchaser_name: string | null;
  purchaser_uuid: string | null;
  research_class_name: string | null;
  memo: string | null;
};

export type SidMaterialChargeRow = {
  cust_num: number;
  rpt_month: string | null;
  quantity: number | null;
  material: string | null;
  description: string | null;
  total_price: number | null;
  currency_code: string | null;
  start_date: string | null;
  end_date: string | null;
  username: string | null;
};

export type ParsedSidFileSet = {
  firmwideId: number;
  billingDate: string;
  accounts: SidAccountRow[];
  subscriptions: SidSubscriptionRow[];
  changes: SidChangeRow[];
  exchangeFees: SidExchangeFeeRow[];
  researchPurchases: SidResearchPurchaseRow[];
  materialCharges: SidMaterialChargeRow[];
  /** Data rows per file, header excluded; placeholder rows included. */
  rowCounts: Record<SidFileIndex, number>;
};
