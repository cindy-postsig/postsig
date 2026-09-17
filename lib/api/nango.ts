import { Nango } from '@nangohq/node';

let _nango: Nango | null = null;

export function getNangoClient(): Nango {
  if (!_nango) {
    const secretKey = process.env.NANGO_SECRET_KEY;
    if (!secretKey) {
      throw new Error('NANGO_SECRET_KEY environment variable is not set');
    }
    _nango = new Nango({ secretKey });
  }
  return _nango;
}

export type NangoProvider = 'xero' | 'ramp';

export const NANGO_PROVIDER_IDS: Record<NangoProvider, string> = {
  xero: 'xero',
  ramp: 'ramp-sandbox', // TODO: Use ramp-sandbox for testing; switch to 'ramp' for production
};
