import { formatCurrencyFull } from '@/app/lib/utils';
import { formatFullUSD } from '@/app/(app)/(investor)/investor/company/[id]/companyDetailsFormat';

describe('formatCurrencyFull', () => {
  it('renders the full amount with thousands separators (no abbreviation)', () => {
    expect(formatCurrencyFull(2547832)).toBe('$2,547,832');
    expect(formatCurrencyFull(1234567890)).toBe('$1,234,567,890');
  });

  it('shows cents only when the value has a fractional part', () => {
    expect(formatCurrencyFull(847120)).toBe('$847,120');
    expect(formatCurrencyFull(2547832.46)).toBe('$2,547,832.46');
  });

  it('pads fractional values to two decimals and rounds beyond the cent', () => {
    expect(formatCurrencyFull(1234.5)).toBe('$1,234.50');
    expect(formatCurrencyFull(1234.567)).toBe('$1,234.57');
  });

  it('formats zero and negative values', () => {
    expect(formatCurrencyFull(0)).toBe('$0');
    expect(formatCurrencyFull(-2547832.5)).toBe('-$2,547,832.50');
  });
});

describe('formatFullUSD', () => {
  it('renders a dash for zero, mirroring the compact formatter', () => {
    expect(formatFullUSD(0)).toBe('-');
  });

  it('renders full amounts with cents-when-present', () => {
    expect(formatFullUSD(847120)).toBe('$847,120');
    expect(formatFullUSD(2547832.46)).toBe('$2,547,832.46');
  });

  it('preserves the exact value instead of rounding to the nearest dollar', () => {
    expect(formatFullUSD(1299999.86)).toBe('$1,299,999.86');
  });
});
