/**
 * Type declarations for @everapi/currencyapi-js
 * This is the single source of truth for CurrencyAPI types.
 */
declare module '@everapi/currencyapi-js' {
  interface CurrencyData {
    code: string;
    value: number;
  }

  interface LatestResponse {
    meta: {
      last_updated_at: string;
    };
    data: Record<string, CurrencyData>;
  }

  interface LatestOptions {
    base_currency?: string;
    currencies?: string[];
  }

  interface HistoricalOptions {
    date: string;
    base_currency?: string;
    currencies?: string[];
  }

  export default class Currencyapi {
    constructor(apiKey: string);
    latest(options?: LatestOptions): Promise<LatestResponse>;
    historical(options: HistoricalOptions): Promise<LatestResponse>;
  }
}
