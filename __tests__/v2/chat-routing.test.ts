import { describe, expect, it } from '@jest/globals';
import { classifyQuery, handleNavigationQuery } from '@/lib/v2/chat/routing';

// =============================================================================
// classifyQuery
// =============================================================================

describe('classifyQuery', () => {
  describe('navigation queries', () => {
    it.each([
      'go to contracts',
      'Go to Contracts',
      'go to the contracts page',
      'take me to contracts',
      'navigate to contracts',
      'show me the dashboard',
      'show dashboard',
      'open vendors',
      'view calendar',
      'visit budget',
      'go to reports',
      'show me invoices report',
      'navigate to dora',
      'open utilization',
      'go to unexecuted',
    ])('classifies "%s" as navigation', (message) => {
      expect(classifyQuery(message)).toBe('navigation');
    });
  });

  describe('complex queries', () => {
    it.each([
      'what contracts are expiring soon?',
      'how much are we spending on AWS?',
      'compare vendor A and vendor B',
      'can you analyze our budget?',
      'which contracts have compliance issues?',
      'list all contracts with risk flags',
    ])('classifies "%s" as complex', (message) => {
      expect(classifyQuery(message)).toBe('complex');
    });
  });

  describe('greeting queries', () => {
    it.each([
      'hello',
      'hi there',
      'hey',
      'thanks',
      'thank you',
      'good morning',
      'bye',
      'help',
      'what can you do',
    ])('classifies "%s" as greeting', (message) => {
      expect(classifyQuery(message)).toBe('greeting');
    });
  });

  // Off-topic detection moved to the LLM (system prompt rule #6: "Stay on
  // domain"). The classifier used to short-circuit these to a canned reply,
  // but it false-positived on legitimate contract questions where no domain
  // keyword happened to have a word-boundary match (e.g. "who is the biggest
  // spender" — "spender" doesn't match \bspend\b, and the "who is …" pattern
  // then claimed it as off-topic). The LLM handles refusal reliably for the
  // small cost of one extra round-trip.
  describe('off-topic queries (now routed to LLM)', () => {
    it.each([
      'write me an email to my boss',
      'what is the capital of France',
      'tell me a joke please',
      'translate this to Spanish',
      'write me a python script',
      'who is the president of the United States',
      'what is the weather today',
    ])(
      'routes "%s" to LLM (greeting/simple/complex, not off-topic)',
      (message) => {
        const classification = classifyQuery(message);
        expect(classification).not.toBe('navigation');
        expect(['greeting', 'simple', 'complex']).toContain(classification);
      },
    );

    it.each([
      'how much are we spending on licenses',
      'what contracts mention compliance',
      'calculate total vendor spend',
      'who is the biggest spender',
      'who is the business sponsor for MSCI',
      'what is the meaning of auto-renewal',
    ])('routes "%s" to LLM as complex', (message) => {
      expect(classifyQuery(message)).toBe('complex');
    });
  });

  describe('simple queries', () => {
    it.each([
      'sure thing',
      'noted',
      'sounds good',
      'yes',
      'no',
      'yep',
      'nope',
      'sure',
      'ok',
      'okay',
      'got it',
      'understood',
    ])('classifies "%s" as simple (sent to LLM for context)', (message) => {
      expect(classifyQuery(message)).toBe('simple');
    });
  });

  it('classifies empty string as simple', () => {
    expect(classifyQuery('')).toBe('simple');
    expect(classifyQuery('   ')).toBe('simple');
  });
});

// =============================================================================
// handleNavigationQuery
// =============================================================================

describe('handleNavigationQuery', () => {
  describe('returns correct navigation response', () => {
    it('resolves "go to contracts" to /contracts', () => {
      const result = handleNavigationQuery('go to contracts');
      expect(result).toEqual({
        navigate: true,
        path: '/contracts',
        label: 'Contracts',
      });
    });

    it('resolves "show me the dashboard" to /dashboard', () => {
      const result = handleNavigationQuery('show me the dashboard');
      expect(result).toEqual({
        navigate: true,
        path: '/dashboard',
        label: 'Dashboard',
      });
    });

    it('resolves "navigate to vendors" to /vendors', () => {
      const result = handleNavigationQuery('navigate to vendors');
      expect(result).toEqual({
        navigate: true,
        path: '/vendors',
        label: 'Vendors',
      });
    });

    it('resolves "open calendar" to /calendar', () => {
      const result = handleNavigationQuery('open calendar');
      expect(result).toEqual({
        navigate: true,
        path: '/calendar',
        label: 'Calendar',
      });
    });

    it('resolves "go to budget" to /budget', () => {
      const result = handleNavigationQuery('go to budget');
      expect(result).toEqual({
        navigate: true,
        path: '/budget',
        label: 'Budget',
      });
    });

    it('resolves "view reports" to /reports', () => {
      const result = handleNavigationQuery('view reports');
      expect(result).toEqual({
        navigate: true,
        path: '/reports',
        label: 'Reports',
      });
    });
  });

  describe('sub-report routes', () => {
    it('resolves "go to invoices" to /reports/invoices', () => {
      const result = handleNavigationQuery('go to invoices');
      expect(result).toEqual({
        navigate: true,
        path: '/reports/invoices',
        label: 'Invoices Report',
      });
    });

    it('resolves "show me dora compliance" to /reports/dora', () => {
      const result = handleNavigationQuery('show me dora compliance');
      expect(result).toEqual({
        navigate: true,
        path: '/reports/dora',
        label: 'Dora Report',
      });
    });

    it('resolves "navigate to contract omissions" to /reports/contract-omissions', () => {
      const result = handleNavigationQuery('navigate to contract omissions');
      expect(result).toEqual({
        navigate: true,
        path: '/reports/contract-omissions',
        label: 'Contract Omissions Report',
      });
    });

    it('resolves "go to unconfirmed" to /reports/unconfirmed', () => {
      const result = handleNavigationQuery('go to unconfirmed');
      expect(result).toEqual({
        navigate: true,
        path: '/reports/unconfirmed',
        label: 'Unconfirmed Report',
      });
    });

    it('resolves "open utilization" to /reports/utilization', () => {
      const result = handleNavigationQuery('open utilization');
      expect(result).toEqual({
        navigate: true,
        path: '/reports/utilization',
        label: 'Utilization Report',
      });
    });

    it('resolves "go to unexecuted" to /reports/unexecuted', () => {
      const result = handleNavigationQuery('go to unexecuted');
      expect(result).toEqual({
        navigate: true,
        path: '/reports/unexecuted',
        label: 'Unexecuted Report',
      });
    });
  });

  describe('fuzzy matching', () => {
    it('handles "go to contracts page" with trailing filler words', () => {
      const result = handleNavigationQuery('go to contracts page');
      expect(result).not.toBeNull();
      expect(result?.path).toBe('/contracts');
    });

    it('handles "take me to the dashboard" with filler "the"', () => {
      const result = handleNavigationQuery('take me to the dashboard');
      expect(result).not.toBeNull();
      expect(result?.path).toBe('/dashboard');
    });

    it('handles "go to my vendors" with filler "my"', () => {
      const result = handleNavigationQuery('go to my vendors');
      expect(result).not.toBeNull();
      expect(result?.path).toBe('/vendors');
    });

    it('handles supplementary alias "home" for dashboard', () => {
      const result = handleNavigationQuery('go to home');
      expect(result).not.toBeNull();
      expect(result?.path).toBe('/dashboard');
    });

    it('handles supplementary alias "deadlines" for calendar', () => {
      const result = handleNavigationQuery('show me deadlines');
      expect(result).not.toBeNull();
      expect(result?.path).toBe('/calendar');
    });

    it('handles supplementary alias "financials" for budget', () => {
      const result = handleNavigationQuery('navigate to financials');
      expect(result).not.toBeNull();
      expect(result?.path).toBe('/budget');
    });

    it('is case-insensitive', () => {
      const result = handleNavigationQuery('GO TO CONTRACTS');
      expect(result).not.toBeNull();
      expect(result?.path).toBe('/contracts');
    });

    it('strips trailing punctuation', () => {
      const result = handleNavigationQuery('go to contracts!');
      expect(result).not.toBeNull();
      expect(result?.path).toBe('/contracts');
    });
  });

  describe('returns null for non-navigation queries', () => {
    it('returns null for empty input', () => {
      expect(handleNavigationQuery('')).toBeNull();
      expect(handleNavigationQuery('   ')).toBeNull();
    });

    it('returns null for a plain greeting', () => {
      expect(handleNavigationQuery('hello')).toBeNull();
    });

    it('returns null for a complex question', () => {
      expect(handleNavigationQuery('what contracts are expiring?')).toBeNull();
    });

    it('returns null when prefix matches but target is unknown', () => {
      expect(handleNavigationQuery('go to nowhere')).toBeNull();
    });

    it('returns null for navigation prefix with no target', () => {
      expect(handleNavigationQuery('go to')).toBeNull();
      expect(handleNavigationQuery('show me')).toBeNull();
    });
  });
});
