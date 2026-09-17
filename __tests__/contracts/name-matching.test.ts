import { describe, expect, it } from '@jest/globals';
import { findByName, toCompareKey, toFoldKey } from '@/lib/name-matching';

describe('toCompareKey', () => {
  it('keeps non-ASCII letters instead of deleting them', () => {
    // The ASCII \w class this replaced produced 'brs'.
    expect(toCompareKey('BØRS')).toBe('børs');
    expect(toCompareKey('BØRS')).toBe(toCompareKey('børs'));
    expect(toCompareKey('Børsen AS')).toBe('børsen as');
  });

  it('leaves non-Latin scripts untouched', () => {
    expect(toCompareKey('日経テレコン')).toBe('日経テレコン');
  });

  it('treats canonically equivalent spellings as one key', () => {
    expect(toCompareKey('Ålesund')).toBe(toCompareKey('Ålesund'));
  });

  it('strips punctuation the same way the previous regex did', () => {
    expect(toCompareKey('Bloomberg Terminal (Pro)')).toBe(
      'bloomberg terminal pro',
    );
    expect(toCompareKey('Reuters-Eikon')).toBe('reuters-eikon');
    expect(toCompareKey("O'Malley Group")).toBe("o'malley group");
    expect(toCompareKey('  Eikon   4  ')).toBe('eikon 4');
  });

  it('returns an empty key for names carrying no identity', () => {
    // An empty key must never reach includes(), which matches everything.
    expect(toCompareKey('')).toBe('');
    expect(toCompareKey('   ')).toBe('');
    expect(toCompareKey('***')).toBe('');
    expect(toCompareKey('---')).toBe('');
    expect(toCompareKey('…')).toBe('');
  });

  it('returns an empty key for non-string input', () => {
    expect(toCompareKey(null as unknown as string)).toBe('');
    expect(toCompareKey(undefined as unknown as string)).toBe('');
    expect(toCompareKey(123 as unknown as string)).toBe('');
  });
});

describe('toFoldKey', () => {
  it('collides the ASCII and non-ASCII spellings of a name', () => {
    expect(toFoldKey('BORS')).toBe('bors');
    expect(toFoldKey('BØRS')).toBe('bors');
    expect(toFoldKey('BORS')).toBe(toFoldKey('BØRS'));
    expect(toFoldKey('Børsen AS')).toBe('borsen as');
  });

  it('folds the other Latin letters without a canonical decomposition', () => {
    expect(toFoldKey('Straße')).toBe('strasse');
    expect(toFoldKey('Łódź')).toBe('lodz');
    expect(toFoldKey('Þór')).toBe('thor');
    expect(toFoldKey('Ærø')).toBe('aero');
    expect(toFoldKey('Nestlé')).toBe('nestle');
  });

  it('folds precomposed characters absent from the deburr table', () => {
    // Guards the NFD-before-deburr ordering: Ǿ decomposes to Ø + U+0301.
    expect(toFoldKey('Ǿ')).toBe('o');
  });

  it('documents why an explicit fold is needed at all', () => {
    // Ø has no canonical decomposition, so NFD alone cannot reach 'o'.
    expect('Ø'.normalize('NFD')).toHaveLength(1);
  });

  it('returns an empty key when the compare key is empty', () => {
    expect(toFoldKey('***')).toBe('');
  });
});

describe('findByName', () => {
  const products = [
    { id: 1, name: 'BØRS' },
    { id: 2, name: 'Børsen AS' },
    { id: 3, name: 'Bloomberg Terminal' },
    { id: 4, name: '***' },
  ];

  it('matches an exact name regardless of case', () => {
    expect(findByName(products, 'BØRS')).toMatchObject({
      item: { id: 1 },
      tier: 'exact',
    });
    expect(findByName(products, 'børs')).toMatchObject({
      item: { id: 1 },
      tier: 'exact',
    });
  });

  it('matches the ASCII-ified spelling the model emits', () => {
    expect(findByName(products, 'BORS')).toMatchObject({
      item: { id: 1 },
      tier: 'folded',
    });
    expect(findByName(products, 'bors')).toMatchObject({
      item: { id: 1 },
      tier: 'folded',
    });
    expect(findByName(products, 'BORSEN AS')).toMatchObject({
      item: { id: 2 },
      tier: 'folded',
    });
  });

  it('does not conflate two different products that share a prefix', () => {
    expect(findByName(products, 'Børsen AS')).toMatchObject({
      item: { id: 2 },
      tier: 'exact',
    });
  });

  it('does not bind a longer name to a short generic product', () => {
    // "TIØN Data" bound to a pre-existing product called "Data" and its fees
    // landed on the wrong row. Raw substring matching is unsound for product
    // identity, so this must now miss and create a correctly-named product.
    const withGeneric = [...products, { id: 5, name: 'Data' }];
    expect(findByName(withGeneric, 'TIØN Data')).toBeUndefined();
    expect(findByName(withGeneric, 'Data')).toMatchObject({
      item: { id: 5 },
      tier: 'exact',
    });
  });

  it('does not bind a bare vendor name to one of its products', () => {
    expect(findByName(products, 'Bloomberg')).toBeUndefined();
  });

  it('still resolves a name that differs by a trailing qualifier', () => {
    const eikons = [{ id: 1, name: 'Eikon Terminal Pro Plus' }];
    expect(findByName(eikons, 'Eikon Terminal Pro')).toMatchObject({
      item: { id: 1 },
      tier: 'word-overlap',
    });
  });

  it('never matches on an identity-less query', () => {
    for (const query of ['', '   ', '***', '---']) {
      expect(findByName(products, query)).toBeUndefined();
    }
  });

  it('never returns a stored record that has no identity', () => {
    for (const query of ['BØRS', 'Bloomberg', 'anything']) {
      expect(findByName(products, query)?.item.id).not.toBe(4);
    }
  });

  it('does not match names that differ by one character', () => {
    // Proves no edit-distance tier was added: "Terminal 1"/"Terminal 2" would
    // score 0.90, higher than the transliteration this fix targets.
    const terminals = [
      { id: 1, name: 'Terminal 1' },
      { id: 2, name: 'Terminal 3' },
    ];
    expect(findByName(terminals, 'Refinitiv Eikon')).toBeUndefined();
    expect(findByName(products, 'Terminal 1')).toBeUndefined();
  });

  it('prefers an exact match over a folded one', () => {
    const mollers = [
      { id: 1, name: 'Møller' },
      { id: 2, name: 'Moller' },
    ];
    expect(findByName(mollers, 'MOLLER')).toMatchObject({
      item: { id: 2 },
      tier: 'exact',
    });
    expect(findByName(mollers, 'MØLLER')).toMatchObject({
      item: { id: 1 },
      tier: 'exact',
    });
  });

  it('flags an ambiguous match', () => {
    const mollers = [
      { id: 1, name: 'Møller' },
      { id: 2, name: 'Moller' },
    ];
    expect(findByName(mollers, 'Mołler')).toMatchObject({
      tier: 'folded',
      ambiguous: true,
    });
  });

  it('returns undefined for an empty candidate list', () => {
    expect(findByName([], 'BØRS')).toBeUndefined();
  });
});
