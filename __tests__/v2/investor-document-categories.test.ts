import { resolveVentureDocumentGroupType } from '@/lib/v2/investor/document-categories';

describe('resolveVentureDocumentGroupType', () => {
  it.each([
    'charter',
    'coi',
    'spa',
    'ira',
    'rofr_cosale',
    'safe',
    'safe_note',
    'cpn',
    'promissory_note',
    'amendment',
    'side_letter',
    'voting',
    'warrant',
  ])('classifies %s as a transaction document', (documentTypeCode) => {
    expect(resolveVentureDocumentGroupType(null, documentTypeCode)).toBe(
      'transaction',
    );
  });

  it('classifies cap table document types separately', () => {
    expect(resolveVentureDocumentGroupType(null, 'cap_table')).toBe(
      'cap_table',
    );
  });

  it('uses valid metadata group type before document type fallback', () => {
    expect(resolveVentureDocumentGroupType('supplemental', 'spa')).toBe(
      'supplemental',
    );
    expect(resolveVentureDocumentGroupType('Capitalization Table', 'spa')).toBe(
      'cap_table',
    );
  });

  it('falls back to supplemental for unknown document types', () => {
    expect(resolveVentureDocumentGroupType(null, 'pitch_deck')).toBe(
      'supplemental',
    );
    expect(resolveVentureDocumentGroupType(null, null)).toBe('supplemental');
  });
});
