import { describe, expect, it } from '@jest/globals';
import {
  crossCheckProductCode,
  decodeAxesFromCode,
  decodeAxesFromName,
  reconcileAxes,
} from '@/lib/exchange-agreement/codeAxes';
import { stripProductCodeFromName } from '@/lib/exchange-agreement/productName';

/**
 * The four `decodeAxesFromCode` cases below are ported verbatim from Alex's
 * `parsing-poc` test suite (`tests/test_sibling_rows.py:124-128`,
 * `test_code_suffix_decodes_use_and_cat`). Keeping them identical is the point:
 * if either implementation drifts, one of the two suites fails.
 */
describe('decodeAxesFromCode — Alex’s fixtures', () => {
  it('decodes MAFFL2-TPLNDRUA', () => {
    expect(decodeAxesFromCode('MAFFL2-TPLNDRUA')).toEqual({
      use: 'TRADING PLATFORM',
      cat: 'RESTRICTED BASIC',
    });
  });

  it('decodes DEQL2-BANDRU', () => {
    expect(decodeAxesFromCode('DEQL2-BANDRU')).toEqual({
      use: 'BROKING/AGENTS',
      cat: 'RESTRICTED BASIC',
    });
  });

  it('decodes ECB1-OUNDRU', () => {
    expect(decodeAxesFromCode('ECB1-OUNDRU')).toEqual({
      use: 'OTHER',
      cat: 'RESTRICTED BASIC',
    });
  });

  it('decodes MAMLP-OCW1', () => {
    expect(decodeAxesFromCode('MAMLP-OCW1')).toEqual({
      use: 'ORIGINAL CREATED WORKS',
      cat: null,
    });
  });
});

describe('decodeAxesFromCode', () => {
  // A trailing letter is significant to matching but carries no axis of its own:
  // "A" denotes Cat A, which the decoder does not read.
  it('decodes the same axes with or without the Cat-A suffix', () => {
    expect(decodeAxesFromCode('MAFFL2-TPLNDRU')).toEqual(
      decodeAxesFromCode('MAFFL2-TPLNDRUA'),
    );
  });

  // The prefix is SKU-like and inconsistent — ECB1 is Level 1 but ECB10 is
  // Level 2 — so nothing is read from it.
  it('reads only the suffix, never the prefix', () => {
    expect(decodeAxesFromCode('ECB1-BANDRU')).toEqual(
      decodeAxesFromCode('ECB10-BANDRU'),
    );
  });

  it('prefers the longest matching key, so TPL wins over a shorter prefix', () => {
    expect(decodeAxesFromCode('XXXX-TPLNDRU').use).toBe('TRADING PLATFORM');
  });

  it('returns nulls for a code with no recognisable suffix', () => {
    expect(decodeAxesFromCode('ABCD-ZZZZ')).toEqual({ use: null, cat: null });
  });

  it('treats a code with no hyphen as its own suffix', () => {
    expect(decodeAxesFromCode('OCW1').use).toBe('ORIGINAL CREATED WORKS');
  });
});

describe('decodeAxesFromName', () => {
  it('reads both axes out of a service order description', () => {
    expect(
      decodeAxesFromName(
        'Euronext Milan AFF Level 2 - Non-Display Trading Platform - Restricted Basic',
      ),
    ).toEqual({ use: 'TRADING PLATFORM', cat: 'RESTRICTED BASIC' });
  });

  it('reads Broking/Agents and Other Use', () => {
    expect(
      decodeAxesFromName(
        'ENX Dublin Equities L2-NonDisplay Broking/Agents Basic',
      ).use,
    ).toBe('BROKING/AGENTS');
    expect(
      decodeAxesFromName(
        'ENX Dublin Equities L2 - Non-Display Other Use - Basic',
      ).use,
    ).toBe('OTHER');
  });

  it('reads Original Created Works', () => {
    expect(
      decodeAxesFromName(
        'ENX Dubl Equities LP - Original Created Works 1-10 end users',
      ).use,
    ).toBe('ORIGINAL CREATED WORKS');
  });

  it('distinguishes Restricted Premium from Restricted Basic', () => {
    expect(decodeAxesFromName('… - Restricted - Premium').cat).toBe(
      'RESTRICTED - PREMIUM',
    );
    expect(decodeAxesFromName('… - Restricted Basic').cat).toBe(
      'RESTRICTED BASIC',
    );
    expect(decodeAxesFromName('… - Enterprise').cat).toBe('ENTERPRISE');
  });

  it('returns nulls when the description encodes neither axis', () => {
    expect(decodeAxesFromName('Some unrelated market data feed')).toEqual({
      use: null,
      cat: null,
    });
  });
});

/**
 * Ported from `test_reconcile_agreement_and_conflict`
 * (parsing-poc tests/test_sibling_rows.py:131-140).
 */
describe('reconcileAxes', () => {
  it('carries agreed axes through with no conflicts', () => {
    expect(
      reconcileAxes(
        { use: 'OTHER', cat: 'RESTRICTED BASIC' },
        { use: 'OTHER', cat: 'RESTRICTED BASIC' },
      ),
    ).toEqual({ use: 'OTHER', cat: 'RESTRICTED BASIC', conflicts: [] });
  });

  it('lets the code fill an axis the name missed', () => {
    expect(
      reconcileAxes(
        { use: null, cat: null },
        { use: 'TRADING PLATFORM', cat: 'RESTRICTED BASIC' },
      ),
    ).toEqual({
      use: 'TRADING PLATFORM',
      cat: 'RESTRICTED BASIC',
      conflicts: [],
    });
  });

  it('surfaces an explicit disagreement instead of resolving it', () => {
    expect(
      reconcileAxes(
        { use: 'OTHER', cat: 'RESTRICTED BASIC' },
        { use: 'TRADING PLATFORM', cat: 'RESTRICTED BASIC' },
      ).conflicts,
    ).toEqual(['use']);
  });

  it('prefers the name read when the two disagree', () => {
    expect(
      reconcileAxes(
        { use: 'OTHER', cat: null },
        { use: 'TRADING PLATFORM', cat: null },
      ).use,
    ).toBe('OTHER');
  });
});

describe('crossCheckProductCode', () => {
  /**
   * Modelled on `test_name_code_conflict_yields_contradictory_axes`
   * (parsing-poc tests/test_sibling_rows.py:143-150): a line whose name says
   * Other Use but whose code says Trading Platform must be flagged, not silently
   * attached to one of them.
   */
  it('flags a name that says Other Use against a code that says Trading Platform', () => {
    const result = crossCheckProductCode(
      'Euronext Dublin Equities Level 2 Non-Display Other Use Restricted Basic',
      'DEQL2-TPLNDRU',
    );
    expect(result.conflicts).toEqual(['use']);
  });

  it('reports no conflict for a consistent line', () => {
    expect(
      crossCheckProductCode(
        'Euronext Milan AFF Level 2 - Non-Display Trading Platform - Restricted Basic',
        'MAFFL2-TPLNDRUA',
      ).conflicts,
    ).toEqual([]);
  });

  // Absence is not disagreement: most products carry no code at all.
  it('reports no conflict when there is no code', () => {
    const result = crossCheckProductCode('Some Trading Platform product', null);
    expect(result.conflicts).toEqual([]);
    expect(result.use).toBe('TRADING PLATFORM');
  });
});

describe('stripProductCodeFromName', () => {
  it('drops a leading code and its separator', () => {
    expect(
      stripProductCodeFromName(
        'DEQL2-BANDRU ENX Dublin Equities L2-NonDisplay Broking/Agents Basic',
        'DEQL2-BANDRU',
      ),
    ).toBe('ENX Dublin Equities L2-NonDisplay Broking/Agents Basic');
  });

  it('drops a trailing parenthesised code', () => {
    expect(
      stripProductCodeFromName(
        'Euronext Milan AFF Level 2 - Non-Display Other Use - Restricted Basic (MAFFL2-OUNDRU)',
        'MAFFL2-OUNDRU',
      ),
    ).toBe(
      'Euronext Milan AFF Level 2 - Non-Display Other Use - Restricted Basic',
    );
  });

  // The ENX marker is part of the description as written, and the extraction
  // rules forbid normalising a verbatim field.
  it('keeps the ENX marker', () => {
    expect(
      stripProductCodeFromName(
        'ECB10-BANDRU ENX Cash Continent L2',
        'ECB10-BANDRU',
      ),
    ).toContain('ENX');
  });

  it('leaves a name that does not carry its code alone', () => {
    expect(
      stripProductCodeFromName('ENX Dublin Equities L2', 'DEQL2-BANDRU'),
    ).toBe('ENX Dublin Equities L2');
  });

  it('leaves the name alone when there is no code', () => {
    expect(stripProductCodeFromName('ENX Dublin Equities L2', null)).toBe(
      'ENX Dublin Equities L2',
    );
  });

  // Alex trims these because markdown-table extraction leaves pipe and dash
  // debris around cell values (order_lines.py:69, `.strip(" -|")`).
  it('trims separator debris left by table extraction', () => {
    expect(
      stripProductCodeFromName(
        '| DEQL2-BANDRU - ENX Dublin Equities |',
        'DEQL2-BANDRU',
      ),
    ).toBe('ENX Dublin Equities');
  });

  it('does not strip a shorter code off a longer one', () => {
    expect(
      stripProductCodeFromName(
        'MAFFL2-TPLNDRUA ENX Milan AFF L2-ND Trading Platform',
        'MAFFL2-TPLNDRU',
      ),
    ).toBe('MAFFL2-TPLNDRUA ENX Milan AFF L2-ND Trading Platform');
  });

  it('strips the code when it is the whole leading token', () => {
    expect(
      stripProductCodeFromName(
        'MAFFL2-TPLNDRUA ENX Milan AFF L2-ND Trading Platform',
        'MAFFL2-TPLNDRUA',
      ),
    ).toBe('ENX Milan AFF L2-ND Trading Platform');
  });

  it('keeps a bare code rather than returning an empty name', () => {
    expect(stripProductCodeFromName('DEQL2-BANDRU', 'DEQL2-BANDRU')).toBe(
      'DEQL2-BANDRU',
    );
  });
});
