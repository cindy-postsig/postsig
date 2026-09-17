import { translatedFileName } from '../paths';

describe('translatedFileName', () => {
  it('inserts the language marker before the extension', () => {
    expect(translatedFileName('berenberg.pdf')).toBe('berenberg.en.pdf');
  });

  it('only splits on the final extension', () => {
    expect(translatedFileName('master.agreement.v2.pdf')).toBe(
      'master.agreement.v2.en.pdf',
    );
  });

  it('appends the marker when there is no extension', () => {
    expect(translatedFileName('contract')).toBe('contract.en');
  });

  it('treats a leading dot as part of the name, not an extension', () => {
    expect(translatedFileName('.hidden')).toBe('.hidden.en');
  });
});
