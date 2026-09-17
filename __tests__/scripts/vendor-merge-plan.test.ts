import { describe, expect, it } from '@jest/globals';
import {
  findDuplicateCandidates,
  parseMergeArgs,
  suggestSurvivor,
  vendorNameKey,
  type VendorRow,
} from '@/scripts/vendor-merge-plan';

const vendor = (
  id: number,
  name: string,
  domain: string | null = null,
  status: string | null = 'active',
): VendorRow => ({ id, name, domain, status, created_at: null });

describe('parseMergeArgs', () => {
  it('parses a pair with flags and defaults the env file', () => {
    const args = parseMergeArgs([
      '--loser',
      '42',
      '--survivor',
      '7',
      '--apply',
    ]);
    expect(args).toEqual({
      find: false,
      loser: 42,
      survivor: 7,
      apply: true,
      allowDrops: false,
      json: false,
      envPath: '.env.local',
    });
  });

  it('parses find mode with an env file', () => {
    const args = parseMergeArgs(['--find', '--env', '.env.prod', '--json']);
    expect(args.find).toBe(true);
    expect(args.envPath).toBe('.env.prod');
    expect(args.json).toBe(true);
  });

  it('rejects an incomplete pair, a pair combined with find, and equal ids', () => {
    expect(() => parseMergeArgs(['--loser', '1'])).toThrow(/either --find/);
    expect(() =>
      parseMergeArgs(['--find', '--loser', '1', '--survivor', '2']),
    ).toThrow(/either --find/);
    expect(() => parseMergeArgs(['--loser', '1', '--survivor', '1'])).toThrow(
      /must differ/,
    );
  });

  it('rejects non-integer ids, unknown flags and a bare --env', () => {
    expect(() => parseMergeArgs(['--loser', 'x', '--survivor', '2'])).toThrow(
      /positive integer/,
    );
    expect(() => parseMergeArgs(['--loser', '0', '--survivor', '2'])).toThrow(
      /positive integer/,
    );
    expect(() => parseMergeArgs(['--find', '--nope'])).toThrow(
      /Unknown argument/,
    );
    expect(() => parseMergeArgs(['--find', '--env'])).toThrow(/--env requires/);
  });
});

describe('vendorNameKey', () => {
  it('ignores case, punctuation and legal suffixes', () => {
    expect(vendorNameKey('Bloomberg L.P.')).toBe(vendorNameKey('bloomberg'));
    expect(vendorNameKey('Refinitiv Ltd')).toBe(
      vendorNameKey('Refinitiv, Ltd.'),
    );
  });

  it('keeps genuinely different names apart', () => {
    expect(vendorNameKey('Bloomberg')).not.toBe(vendorNameKey('Bloomberg Tax'));
  });
});

describe('findDuplicateCandidates', () => {
  it('groups vendors whose folded names match', () => {
    const groups = findDuplicateCandidates([
      vendor(1, 'Bloomberg'),
      vendor(2, 'Bloomberg L.P.'),
      vendor(3, 'FactSet'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe('name');
    expect(groups[0].vendors.map((v) => v.id)).toEqual([1, 2]);
  });

  it('groups different names that share a domain', () => {
    const groups = findDuplicateCandidates([
      vendor(1, 'Bloomberg', 'https://www.bloomberg.com/'),
      vendor(2, 'BBG Finance', 'bloomberg.com'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe('domain');
    expect(groups[0].key).toBe('bloomberg.com');
  });

  it('ignores query strings and fragments when comparing domains', () => {
    const groups = findDuplicateCandidates([
      vendor(1, 'Bloomberg', 'https://www.example.com?source=x'),
      vendor(2, 'BBG Finance', 'example.com#team'),
      vendor(3, 'Example Data', 'http://example.com/pricing?plan=a'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('example.com');
    expect(groups[0].vendors.map((v) => v.id)).toEqual([1, 2, 3]);
  });

  it('does not report a name group twice as a domain group', () => {
    const groups = findDuplicateCandidates([
      vendor(1, 'Bloomberg', 'bloomberg.com'),
      vendor(2, 'Bloomberg LP', 'bloomberg.com'),
    ]);
    expect(groups.map((g) => g.reason)).toEqual(['name']);
  });

  it('skips retired vendors and ignores empty domains', () => {
    const groups = findDuplicateCandidates([
      vendor(1, 'Bloomberg', null),
      vendor(2, 'Bloomberg', null, 'merged'),
      vendor(3, 'Bloomberg', null, 'duplicate'),
      vendor(4, 'FactSet', ''),
      vendor(5, 'Morningstar', ''),
    ]);
    expect(groups).toHaveLength(0);
  });

  it('orders members and groups by id', () => {
    const groups = findDuplicateCandidates([
      vendor(9, 'Refinitiv'),
      vendor(4, 'Bloomberg'),
      vendor(2, 'Refinitiv Ltd'),
      vendor(7, 'Bloomberg LP'),
    ]);
    expect(groups.map((g) => g.vendors.map((v) => v.id))).toEqual([
      [2, 9],
      [4, 7],
    ]);
  });
});

describe('suggestSurvivor', () => {
  const group = {
    key: 'bloomberg',
    reason: 'name' as const,
    vendors: [vendor(1, 'Bloomberg'), vendor(2, 'Bloomberg L.P.')],
  };

  it('prefers the vendor with the most contracts', () => {
    const counts = new Map([
      [1, 2],
      [2, 10],
    ]);
    expect(suggestSurvivor(group, counts).id).toBe(2);
  });

  it('breaks ties on the lowest id', () => {
    const counts = new Map([
      [1, 5],
      [2, 5],
    ]);
    expect(suggestSurvivor(group, counts).id).toBe(1);
    expect(suggestSurvivor(group, new Map()).id).toBe(1);
  });
});
