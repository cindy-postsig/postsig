import {
  countryCodeForLocation,
  normalizeLocationName,
} from '@/constants/city-country';
import { COUNTRIES_ALPHA3 } from '@/constants/countries';

/** Every distinct Region value in the customer's real file. */
const SAMPLE_FILE_LOCATIONS: [string, string][] = [
  ['London', 'GBR'],
  ['Hamburg', 'DEU'],
  ['Frankfurt', 'DEU'],
  ['New York', 'USA'],
  ['Paris', 'FRA'],
  ['Dusseldorf', 'DEU'],
  ['Munich', 'DEU'],
  ['Geneva', 'CHE'],
  ['Muenster', 'DEU'],
  ['Bremen', 'DEU'],
  ['Stuttgart', 'DEU'],
  ['Zurich', 'CHE'],
  ['Boston', 'USA'],
  ['Nuremberg', 'DEU'],
  ['Berlin', 'DEU'],
  ['Braunschweig', 'DEU'],
  ['Stockholm', 'SWE'],
  ['Hanover', 'DEU'],
  ['San Francisco', 'USA'],
  ['Toronto (NYC)', 'CAN'],
];

describe('normalizeLocationName', () => {
  it('strips a parenthetical qualifier', () => {
    expect(normalizeLocationName('Toronto (NYC)')).toBe('toronto');
  });

  it('collapses whitespace and folds case', () => {
    expect(normalizeLocationName('  SAN   Francisco ')).toBe('san francisco');
  });

  it('returns empty for a blank value', () => {
    expect(normalizeLocationName('   ')).toBe('');
  });
});

describe('countryCodeForLocation', () => {
  it.each(SAMPLE_FILE_LOCATIONS)('resolves %s to %s', (location, expected) => {
    expect(countryCodeForLocation(location)).toBe(expected);
  });

  it('every location in the customer file resolves', () => {
    const unresolved = SAMPLE_FILE_LOCATIONS.filter(
      ([location]) => countryCodeForLocation(location) === null,
    );
    expect(unresolved).toEqual([]);
  });

  it.each(['london', 'LONDON', '  London  '])(
    'is case and whitespace insensitive for %p',
    (input) => {
      expect(countryCodeForLocation(input)).toBe('GBR');
    },
  );

  it('returns null for an unknown location rather than guessing', () => {
    expect(countryCodeForLocation('Atlantis')).toBeNull();
    expect(countryCodeForLocation('')).toBeNull();
  });

  it('only ever emits codes that exist in the ISO list', () => {
    const valid = new Set(COUNTRIES_ALPHA3.map((c) => c.code));
    const emitted = SAMPLE_FILE_LOCATIONS.map(([location]) =>
      countryCodeForLocation(location),
    );
    for (const code of emitted) {
      expect(valid.has(code as string)).toBe(true);
    }
  });
});
