// Best-effort city / office-location -> ISO 3166-1 alpha-3, used to derive an
// employee's Country from their Region when an HR file carries only a city.
//
// This will never be exhaustive. Unresolved values are surfaced in the import
// preview and can be overridden per value in the mapping, so a miss is visible
// and fixable rather than a silent blank.

const CITY_TO_ALPHA3: Record<string, string> = {
  // Germany — includes the English exonyms HR exports commonly use
  berlin: 'DEU',
  bonn: 'DEU',
  braunschweig: 'DEU',
  bremen: 'DEU',
  cologne: 'DEU',
  koln: 'DEU',
  dortmund: 'DEU',
  dresden: 'DEU',
  duesseldorf: 'DEU',
  dusseldorf: 'DEU',
  essen: 'DEU',
  frankfurt: 'DEU',
  'frankfurt am main': 'DEU',
  hamburg: 'DEU',
  hanover: 'DEU',
  hannover: 'DEU',
  karlsruhe: 'DEU',
  leipzig: 'DEU',
  mannheim: 'DEU',
  muenchen: 'DEU',
  munich: 'DEU',
  muenster: 'DEU',
  munster: 'DEU',
  nuremberg: 'DEU',
  nurnberg: 'DEU',
  stuttgart: 'DEU',

  // United Kingdom & Ireland
  belfast: 'GBR',
  birmingham: 'GBR',
  edinburgh: 'GBR',
  glasgow: 'GBR',
  leeds: 'GBR',
  london: 'GBR',
  manchester: 'GBR',
  dublin: 'IRL',

  // Rest of Europe
  amsterdam: 'NLD',
  rotterdam: 'NLD',
  brussels: 'BEL',
  copenhagen: 'DNK',
  helsinki: 'FIN',
  lyon: 'FRA',
  paris: 'FRA',
  athens: 'GRC',
  budapest: 'HUN',
  milan: 'ITA',
  rome: 'ITA',
  luxembourg: 'LUX',
  oslo: 'NOR',
  warsaw: 'POL',
  lisbon: 'PRT',
  bucharest: 'ROU',
  barcelona: 'ESP',
  madrid: 'ESP',
  gothenburg: 'SWE',
  stockholm: 'SWE',
  basel: 'CHE',
  basle: 'CHE',
  geneva: 'CHE',
  geneve: 'CHE',
  zug: 'CHE',
  zurich: 'CHE',
  zuerich: 'CHE',
  vienna: 'AUT',
  prague: 'CZE',
  istanbul: 'TUR',

  // Americas
  atlanta: 'USA',
  boston: 'USA',
  charlotte: 'USA',
  chicago: 'USA',
  dallas: 'USA',
  denver: 'USA',
  houston: 'USA',
  'los angeles': 'USA',
  miami: 'USA',
  'new york': 'USA',
  nyc: 'USA',
  philadelphia: 'USA',
  'san francisco': 'USA',
  seattle: 'USA',
  'washington dc': 'USA',
  calgary: 'CAN',
  montreal: 'CAN',
  toronto: 'CAN',
  vancouver: 'CAN',
  'mexico city': 'MEX',
  'sao paulo': 'BRA',
  'buenos aires': 'ARG',

  // Asia-Pacific, Middle East & Africa
  sydney: 'AUS',
  melbourne: 'AUS',
  auckland: 'NZL',
  beijing: 'CHN',
  shanghai: 'CHN',
  shenzhen: 'CHN',
  'hong kong': 'HKG',
  bangalore: 'IND',
  bengaluru: 'IND',
  mumbai: 'IND',
  'new delhi': 'IND',
  jakarta: 'IDN',
  osaka: 'JPN',
  tokyo: 'JPN',
  'kuala lumpur': 'MYS',
  manila: 'PHL',
  singapore: 'SGP',
  seoul: 'KOR',
  taipei: 'TWN',
  bangkok: 'THA',
  'tel aviv': 'ISR',
  'abu dhabi': 'ARE',
  dubai: 'ARE',
  doha: 'QAT',
  riyadh: 'SAU',
  cairo: 'EGY',
  johannesburg: 'ZAF',
  'cape town': 'ZAF',
  lagos: 'NGA',
  nairobi: 'KEN',
};

/**
 * HR exports label offices inconsistently — "Toronto (NYC)" means the Toronto
 * desk of the New York entity. Strip any parenthetical qualifier, collapse
 * whitespace and case-fold before looking up.
 */
export function normalizeLocationName(value: string): string {
  return (
    value
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      // German exports spell offices either way ("Zürich" / "Zurich"), so fold
      // accents to the ASCII keys above. ß has no decomposition of its own.
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  );
}

/** Returns an ISO alpha-3 code, or null when the location is not recognised. */
export function countryCodeForLocation(value: string): string | null {
  const normalized = normalizeLocationName(value);
  if (normalized === '') return null;
  return CITY_TO_ALPHA3[normalized] ?? null;
}
