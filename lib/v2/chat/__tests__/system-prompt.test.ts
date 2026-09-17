import { buildSystemPrompt } from '../service';

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt(
    '  - Path: /dashboard, Description: Dashboard',
    'USD',
  );

  it('includes stay-on-domain guardrail', () => {
    expect(prompt).toContain('Stay on domain');
    expect(prompt).toContain('Briefly redirect anything else');
  });

  it('includes insufficient data guidance', () => {
    expect(prompt).toContain('Insufficient data');
    expect(prompt).toContain(
      "state explicitly what you found and what's missing",
    );
    expect(prompt).toContain("Don't pad with generic filler");
  });

  it('includes tool-error handling rule', () => {
    expect(prompt).toContain('Tool errors');
    expect(prompt).toContain("don't answer from it");
  });

  it('includes no-tool-narration rule', () => {
    expect(prompt).toContain('No tool narration');
  });

  it('includes navigation rule with JSON action shape', () => {
    expect(prompt).toContain('Navigation');
    expect(prompt).toContain('{"action": "navigate", "path": "/route"}');
  });

  it('includes available routes', () => {
    expect(prompt).toContain('Available Routes');
    expect(prompt).toContain('/dashboard');
  });

  it("includes today's date for date-relative reasoning", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(prompt).toContain(today);
  });

  it('states the org base currency with its symbol', () => {
    expect(prompt).toContain('base display currency is USD ($)');
    expect(prompt).toContain('$66,656');
  });

  it('states EUR denomination and symbol for EUR orgs', () => {
    const eurPrompt = buildSystemPrompt('', 'EUR');
    expect(eurPrompt).toContain('base display currency is EUR (€)');
    expect(eurPrompt).toContain('€66,656');
    expect(eurPrompt).toContain('never any other currency symbol');
  });

  it('instructs that source-currency fields keep their own symbol', () => {
    expect(prompt).toContain('`currency` or `contractCurrency`');
    expect(prompt).toContain(
      "denominated in THAT currency — format them with that currency's symbol",
    );
    expect(prompt).toContain('source-currency amounts keep their own symbol');
  });
});
