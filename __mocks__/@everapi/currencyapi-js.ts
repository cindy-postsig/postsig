class CurrencyAPI {
  constructor(_apiKey: string) {}

  async latest(_options?: { base_currency?: string }) {
    return {
      data: {
        EUR: { value: 0.92 },
        GBP: { value: 0.79 },
        JPY: { value: 149.5 },
        CAD: { value: 1.36 },
        AUD: { value: 1.53 },
      },
    };
  }
}

export default CurrencyAPI;
