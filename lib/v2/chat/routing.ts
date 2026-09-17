/**
 * Rule-Based Navigation Query Handler
 *
 * Detects simple navigation queries (e.g., "go to contracts", "show me the dashboard")
 * and returns a structured navigation response without requiring an LLM call.
 *
 * Uses fuzzy keyword matching against PREDEFINED_CHATBOT_ROUTES to resolve
 * user intent to a specific application route.
 */

import {
  PREDEFINED_CHATBOT_ROUTES,
  type AppRoutePath,
} from '@/lib/config/routes';

// =============================================================================
// TYPES
// =============================================================================

export type QueryClassification =
  | 'navigation'
  | 'greeting'
  | 'simple'
  | 'complex';

export interface NavigationResponse {
  navigate: true;
  path: string;
  label: string;
}

interface RouteEntry {
  path: AppRoutePath;
  label: string;
  /** Lowercase aliases used for fuzzy matching (includes the label itself) */
  aliases: readonly string[];
}

// =============================================================================
// NAVIGATION INTENT PATTERNS
// =============================================================================

/**
 * Phrases that signal the user wants to navigate somewhere.
 * Ordered longest-first so greedy matching works correctly.
 */
const NAVIGATION_PREFIXES: readonly string[] = [
  'take me to',
  'bring me to',
  'navigate to',
  'redirect to',
  'go to',
  'open',
  'show me',
  'show',
  'view',
  'visit',
] as const;

// =============================================================================
// ROUTE LABEL & ALIAS MAPPING
// =============================================================================

/** Supplementary aliases for common user phrasing, keyed by route path */
const SUPPLEMENTARY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  '/dashboard': ['home', 'main page', 'overview'],
  '/contracts': ['contract list', 'all contracts', 'my contracts'],
  '/vendors': ['vendor list', 'all vendors', 'my vendors', 'suppliers'],
  '/calendar': ['dates', 'deadlines', 'schedule'],
  '/budget': ['budgets', 'spending', 'expenditures', 'financials'],
  '/reports': ['reporting', 'analytics', 'all reports'],
  '/reports/invoices': ['invoice report', 'invoices', 'invoice reports'],
  '/reports/utilization': [
    'utilization report',
    'utilization',
    'utilization reports',
  ],
  '/reports/unconfirmed': [
    'unconfirmed report',
    'unconfirmed contracts',
    'unconfirmed',
  ],
  '/reports/contract-omissions': [
    'omissions report',
    'omissions',
    'contract omissions',
    'missing clauses',
  ],
  '/reports/dora': ['dora report', 'dora compliance', 'dora', 'dora reports'],
  '/reports/unexecuted': [
    'unexecuted report',
    'unexecuted contracts',
    'unsigned contracts',
    'unexecuted',
  ],
};

/**
 * Build a human-readable label from a route path.
 * "/reports/contract-omissions" -> "Contract Omissions Report"
 */
function buildLabel(path: string): string {
  const segments = path.replace(/^\//, '').split('/');
  const isSubReport = segments.length > 1 && segments[0] === 'reports';

  const humanize = (s: string): string =>
    s
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  if (isSubReport) {
    return `${humanize(segments.slice(1).join(' '))} Report`;
  }
  return humanize(segments[segments.length - 1]);
}

/** Deduplicated push: only adds value if not already present */
function addUnique(list: string[], value: string): void {
  if (!list.includes(value)) {
    list.push(value);
  }
}

/**
 * Generate lowercase aliases for a given route so users can refer to it
 * in multiple natural ways.
 */
function buildAliases(path: AppRoutePath, label: string): string[] {
  const aliases: string[] = [label.toLowerCase()];

  const segments = path.replace(/^\//, '').split('/');
  addUnique(aliases, segments[segments.length - 1].replace(/-/g, ' '));
  addUnique(aliases, segments.join(' '));

  const extras = SUPPLEMENTARY_ALIASES[path];
  if (extras) {
    extras.forEach((alias) => addUnique(aliases, alias));
  }

  return aliases;
}

/**
 * Pre-computed route lookup table. Built once at module load from PREDEFINED_CHATBOT_ROUTES
 * (which excludes parameterized routes like /contracts/:id).
 */
const ROUTE_TABLE: readonly RouteEntry[] = PREDEFINED_CHATBOT_ROUTES.map(
  (path) => ({
    path,
    label: buildLabel(path),
    aliases: buildAliases(path, buildLabel(path)),
  }),
);

// =============================================================================
// CORE LOGIC
// =============================================================================

/**
 * Normalize user input: trim, collapse whitespace, lowercase, strip trailing punctuation.
 */
function normalize(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[?.!]+$/, '');
}

/**
 * Strip a recognized navigation prefix from the normalized message and return
 * the remaining "target" portion, or null if no prefix matched.
 */
function extractNavigationTarget(normalized: string): string | null {
  for (const prefix of NAVIGATION_PREFIXES) {
    if (!normalized.startsWith(prefix)) {
      continue;
    }
    const rest = normalized.slice(prefix.length).trim();
    const cleaned = rest
      .replace(/^(the|my|a|an)\s+/g, '')
      .replace(/\s+(page|screen|section|tab|view)$/g, '')
      .trim();
    return cleaned.length > 0 ? cleaned : null;
  }
  return null;
}

/** Check if two words fuzzy-match via prefix relationship (min 3 chars to avoid false positives) */
function wordsOverlap(a: string, b: string): boolean {
  if (a.length < 3 || b.length < 3) return a === b;
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * Score how well a target string matches a single alias.
 * Returns 1.0 if every target word is covered, 0 otherwise.
 */
function computeWordOverlapScore(target: string, alias: string): number {
  const targetWords = target.split(' ').filter((w) => w.length > 0);
  if (targetWords.length === 0) return 0;

  const aliasWords = alias.split(' ');
  const matched = targetWords.filter((tw) =>
    aliasWords.some((aw) => wordsOverlap(tw, aw)),
  );
  const coverage = matched.length / targetWords.length;
  return coverage >= 1 ? matched.length : 0;
}

/**
 * Attempt to match a target string against known route aliases.
 * Returns the best matching RouteEntry or null.
 *
 * Matching strategy (in priority order):
 * 1. Exact alias match
 * 2. Alias starts with target or target starts with alias
 * 3. All words in the target appear in at least one alias
 */
function matchRoute(target: string): RouteEntry | null {
  // 1. Exact match
  const exactMatch = ROUTE_TABLE.find((e) => e.aliases.includes(target));
  if (exactMatch) return exactMatch;

  // 2. Prefix match — only when target is a single word (multi-word targets
  //    like "spending breakdown" must not match the alias "spending")
  const targetWordCount = target.split(' ').length;
  if (targetWordCount === 1) {
    const prefixMatch = ROUTE_TABLE.find((entry) =>
      entry.aliases.some((a) => a.startsWith(target) || target.startsWith(a)),
    );
    if (prefixMatch) return prefixMatch;
  }

  // 3. Word overlap: every target word appears in some alias
  let bestMatch: RouteEntry | null = null;
  let bestScore = 0;

  for (const entry of ROUTE_TABLE) {
    for (const alias of entry.aliases) {
      const score = computeWordOverlapScore(target, alias);
      if (score > bestScore) {
        bestMatch = entry;
        bestScore = score;
      }
    }
  }

  return bestMatch;
}

// =============================================================================
// GREETING DETECTION
// =============================================================================

const GREETING_PATTERNS: readonly RegExp[] = [
  /^(hi|hey|hello|howdy|yo|sup|hiya|greetings|good\s*(morning|afternoon|evening|day))(\s+(there|everyone|all))?(\s|[!.,?])*$/,
  /^(thanks|thank\s*you|thx|ty|cheers|much\s*appreciated)(\s|[!.,?])*$/,
  /^(bye|goodbye|see\s*you|later|cya)(\s|[!.,?])*$/,
  /^what\s*can\s*you\s*(do|help\s*with)(\s|[!.,?])*$/,
  /^help(\s|[!.,?])*$/,
];

function isGreeting(normalized: string): boolean {
  return GREETING_PATTERNS.some((p) => p.test(normalized));
}

/**
 * Detect whether a message looks like it has complex intent that should
 * go to the LLM (questions, analysis requests, multi-part queries).
 */
function hasComplexSignals(normalized: string): boolean {
  const complexPatterns = [
    /^(what|how|why|when|where|which|who|can you|could you|would you|is there|are there|do we|does)/,
    /\b(compare|analyze|explain|summarize|calculate|list all|find all|how many|how much)\b/,
    /\b(and also|as well as|in addition|furthermore)\b/,
    /\b(expiring|renewing|spending|budget|compliance|risk)\b/,
  ];

  return complexPatterns.some((p) => p.test(normalized));
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Classify a user message into one of three categories:
 *
 * - `navigation`: A simple "go to X" style request that can be resolved to a route.
 * - `simple`: A short, non-navigation message that does not require complex reasoning.
 * - `complex`: Anything that needs full LLM processing (questions, analysis, multi-part).
 */
export function classifyQuery(message: string): QueryClassification {
  const normalized = normalize(message);

  if (normalized.length === 0) {
    return 'simple';
  }

  if (isGreeting(normalized)) {
    return 'greeting';
  }

  const target = extractNavigationTarget(normalized);
  if (target !== null && matchRoute(target) !== null) {
    return 'navigation';
  }

  if (hasComplexSignals(normalized)) {
    return 'complex';
  }

  return 'simple';
}

/**
 * Attempt to handle a navigation query directly.
 *
 * If the message matches a known navigation pattern + route, returns a
 * NavigationResponse with the resolved path and human-readable label.
 *
 * Returns null for non-navigation queries, allowing the caller to fall
 * through to LLM processing.
 */
export function handleNavigationQuery(
  message: string,
): NavigationResponse | null {
  const normalized = normalize(message);

  if (normalized.length === 0) {
    return null;
  }

  const target = extractNavigationTarget(normalized);
  if (target === null) {
    return null;
  }

  const matched = matchRoute(target);
  if (matched === null) {
    return null;
  }

  return {
    navigate: true,
    path: matched.path,
    label: matched.label,
  };
}
