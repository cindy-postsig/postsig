import { documentExportFilename } from '@/lib/csv-export/filename';
import { contractTypes } from '@/app/lib/constants';

describe('documentExportFilename', () => {
  it('names invoice exports after the invoice', () => {
    expect(documentExportFilename(contractTypes.Invoice, 1190)).toBe(
      'invoice-1190.csv',
    );
  });

  it('names other contract types after the contract', () => {
    expect(documentExportFilename(contractTypes.MSA, 42)).toBe(
      'contract-42.csv',
    );
  });

  it('falls back to the contract noun when the type is unknown', () => {
    expect(documentExportFilename(null, 7)).toBe('contract-7.csv');
    expect(documentExportFilename(undefined, 7)).toBe('contract-7.csv');
  });
});
