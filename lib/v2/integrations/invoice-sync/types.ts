import type { TermDateEntry } from './dates';

export type NangoProvider = 'xero' | 'ramp';

// Raw invoice shape from Xero API (via Nango proxy)
export interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber: string;
  Type: string;
  Status: string;
  Contact?: {
    ContactID: string;
    Name: string;
  };
  Date: string;
  DueDate: string;
  CurrencyCode: string;
  AmountDue: number;
  AmountPaid: number;
  AmountCredited?: number;
  Total: number;
  SubTotal: number;
  LineItems?: Array<{
    Description: string;
    Quantity: number;
    UnitAmount: number;
    LineAmount: number;
    AccountCode?: string;
    ItemCode?: string;
  }>;
  Payments?: Array<unknown>;
  CreditNotes?: Array<unknown>;
  Prepayments?: Array<unknown>;
  Overpayments?: Array<unknown>;
}

// Raw invoice shape from Ramp API (via Nango proxy)
export interface RampInvoice {
  id: string;
  invoice_number?: string;
  state?: string;
  status?: string;
  approval_status?: string;
  merchant?: {
    id: string;
    name: string;
  };
  invoice_date?: string;
  due_date?: string;
  currency_code: string;
  amount: number;
  memo?: string;
  line_items?: Array<{
    id: string;
    amount: number;
    memo?: string;
  }>;
  invoice_urls?: string[];
}

// PostSig contract shape for an ingested invoice (type_id=6)
export interface MappedInvoiceContract {
  external_source: NangoProvider;
  external_invoice_id: string;
  external_invoice_status?: string;
  type_id: 6;
  invoice_status:
    | 'review'
    | 'incomplete'
    | 'declined'
    | 'void'
    | 'paid'
    | 'approved';
  vendor_name: string;
  currency: string;
  current_budget: number;
  billing_frequency: string;
  /** Invoice date, 'YYYY-MM-DD' — the meaning execution_date carries for an invoice. */
  execution_date: string | null;
  due_date: string | null;
  term_start_date: TermDateEntry[] | null;
  term_end_date: TermDateEntry[] | null;
  summary: string;
  last_synced_at: string;
  status_id: number;
}
