// __tests__/v2/inv-editable-value-schema.test.ts
//
// buildEditValueSchema is the validate-only zod schema behind the RHF edit form.
// It checks a user-typed string against the field's registry rule, coercing
// numbers (and percent → fraction) before the rule runs. These tests pin the
// edge cases the manual buildInput used to guard — they are the verification for
// the react-hook-form/zod migration (the form UI itself is auth-gated).

jest.mock('server-only', () => ({}));

import {
  buildEditValueSchema,
  toFormValue,
  toStoredValue,
} from '@/components/investor/EditableValue';
import { getEditableField } from '@/lib/v2/inv/overrides/registry';

function fieldFor(entityType: string, fieldKey: string) {
  const def = getEditableField(entityType, fieldKey);
  if (!def) throw new Error(`missing test field ${entityType}.${fieldKey}`);
  return def;
}

// implied_valuation: plain non-negative number.
const numberSchema = () =>
  buildEditValueSchema(fieldFor('inv_cap_table_snapshot', 'implied_valuation'));
// our_fd_ownership_percent: stored as a 0–1 fraction, entered as a percent.
const percentSchema = () =>
  buildEditValueSchema(
    fieldFor('inv_cap_table_snapshot', 'our_fd_ownership_percent'),
  );
// transaction_date: ISO date string.
const dateSchema = () =>
  buildEditValueSchema(fieldFor('inv_transaction', 'transaction_date'));
// drag_along: an Other Legal Terms status flag, edited via a Yes/No select.
const booleanSchema = () =>
  buildEditValueSchema(fieldFor('inv_round_terms', 'drag_along'));
// inv_company.domain: shown as Website, stored as a bare domain.
const domainSchema = () =>
  buildEditValueSchema(fieldFor('inv_company', 'domain'));

const parseValue = (
  schema: ReturnType<typeof buildEditValueSchema>,
  value: string,
) => schema.safeParse({ value, justification: '' });

const valueError = (
  schema: ReturnType<typeof buildEditValueSchema>,
  value: string,
): string | undefined => {
  const result = parseValue(schema, value);
  return result.success ? undefined : result.error.issues[0]?.message;
};

describe('buildEditValueSchema — value validation', () => {
  it('rejects an empty number (never silently persists 0)', () => {
    expect(parseValue(numberSchema(), '').success).toBe(false);
  });

  it('rejects a whitespace-only number', () => {
    expect(parseValue(numberSchema(), '   ').success).toBe(false);
  });

  it('rejects a non-numeric string for a number field', () => {
    expect(parseValue(numberSchema(), 'abc').success).toBe(false);
  });

  it('gives a friendly message for non-numeric input (not raw zod NaN text)', () => {
    const message = valueError(numberSchema(), 'abc');
    expect(message).toBe('Enter a valid number');
    expect(message).not.toMatch(/NaN/i);
  });

  it('gives a percent-aware hint for non-numeric input on percent fields', () => {
    expect(valueError(percentSchema(), 'abc')).toBe(
      'Enter a number (e.g. 10 for 10%)',
    );
  });

  it('gives a field-named message for an empty value', () => {
    expect(valueError(numberSchema(), '')).toMatch(/^Enter a /);
    expect(valueError(numberSchema(), '')).not.toMatch(/NaN/i);
  });

  it('accepts a valid non-negative number', () => {
    expect(parseValue(numberSchema(), '2500000').success).toBe(true);
  });

  it('rejects a negative value for a non-negative field', () => {
    expect(parseValue(numberSchema(), '-1').success).toBe(false);
  });

  it('accepts a percent that maps into the 0–1 fraction range', () => {
    // 10% → 0.1, within the stored 0–1 rule.
    expect(parseValue(percentSchema(), '10').success).toBe(true);
  });

  it('rejects a percent that exceeds 100 (fraction > 1)', () => {
    // 150% → 1.5, outside the stored 0–1 rule.
    expect(parseValue(percentSchema(), '150').success).toBe(false);
  });

  it('rejects a malformed date', () => {
    expect(parseValue(dateSchema(), '2026-13-01').success).toBe(false);
  });

  it('rejects an empty date', () => {
    expect(parseValue(dateSchema(), '').success).toBe(false);
  });

  it('accepts a valid ISO date', () => {
    expect(parseValue(dateSchema(), '2026-02-01').success).toBe(true);
  });
});

describe('buildEditValueSchema — boolean fields', () => {
  it.each(['true', 'false'])('accepts the select literal %s', (value) => {
    expect(parseValue(booleanSchema(), value).success).toBe(true);
  });

  it('rejects an unselected value with a select-flavoured message', () => {
    expect(valueError(booleanSchema(), '')).toBe('Select Yes or No');
  });

  it('rejects anything the select cannot emit', () => {
    // Guards against a corrupt value silently coercing to false.
    for (const value of ['maybe', 'yes', '1', 'True']) {
      expect(valueError(booleanSchema(), value)).toBe('Select Yes or No');
    }
  });
});

describe('buildEditValueSchema — company detail fields', () => {
  it('accepts website input with a protocol after normalizing to a domain', () => {
    expect(
      parseValue(domainSchema(), 'https://www.example.com/path').success,
    ).toBe(true);
  });

  it('rejects malformed website input', () => {
    expect(valueError(domainSchema(), 'not-a-domain')).toBe(
      'Enter a valid domain',
    );
  });
});

// anti_dilution_type: a string code chosen from a dropdown.
const codeSchema = () =>
  buildEditValueSchema(fieldFor('inv_security_terms', 'anti_dilution_type'));
// dividend_seniority: a numeric rank chosen from a dropdown.
const rankSchema = () =>
  buildEditValueSchema(fieldFor('inv_security_terms', 'dividend_seniority'));

describe('buildEditValueSchema — fixed-choice (options) fields', () => {
  it('accepts a stored code emitted by the dropdown', () => {
    expect(parseValue(codeSchema(), 'broad_based').success).toBe(true);
  });

  it('rejects the display label the user sees', () => {
    expect(
      parseValue(codeSchema(), 'Broad-Based Weighted Average').success,
    ).toBe(false);
  });

  it('rejects a code outside the option list', () => {
    expect(valueError(codeSchema(), 'ratchet')).toBe('Select a value');
  });

  it('rejects an unselected options value with a select-flavoured message', () => {
    expect(valueError(codeSchema(), '')).toBe('Select a value');
    expect(valueError(rankSchema(), '')).toBe('Select a value');
  });

  it('validates a numeric-valued option as a number, not a string', () => {
    // The form carries "2"; the rule is z.literal(1|2|3) and would reject the
    // string, so the resolver has to map it back to the option's typed value.
    expect(parseValue(rankSchema(), '2').success).toBe(true);
    expect(parseValue(rankSchema(), '4').success).toBe(false);
  });
});

describe('toStoredValue / toFormValue', () => {
  it('stores a numeric option as a number', () => {
    const stored = toStoredValue(
      '2',
      fieldFor('inv_security_terms', 'dividend_seniority'),
      undefined,
      undefined,
    );
    // A string "2" here would be dropped by applyOverrides on the next read.
    expect(stored).toBe(2);
    expect(typeof stored).toBe('number');
  });

  it('stores a coded option as its code', () => {
    expect(
      toStoredValue(
        'full_ratchet',
        fieldFor('inv_security_terms', 'anti_dilution_type'),
        undefined,
        undefined,
      ),
    ).toBe('full_ratchet');
  });

  it('seeds an options select from the current stored value', () => {
    const seniority = fieldFor('inv_security_terms', 'dividend_seniority');
    expect(toFormValue(seniority, 3)).toBe('3');
    // Empty column — the dropdown opens unselected rather than on a wrong rank.
    expect(toFormValue(seniority, null)).toBe('');
  });

  // A null boolean means "not recorded", not false. Seeding 'false' would both
  // misreport it as a No and make the unchanged-guard treat picking No as a no-op,
  // leaving the flag impossible to set to false.
  it('leaves a null boolean unseeded so it can be set to either value', () => {
    const accruing = fieldFor('inv_security_terms', 'dividend_accruing');
    expect(toFormValue(accruing, null)).toBe('');
    expect(toFormValue(accruing, false)).toBe('false');
    expect(toFormValue(accruing, true)).toBe('true');
  });

  it('leaves free-text fields unseeded so the current value shows as a placeholder', () => {
    expect(
      toFormValue(
        fieldFor('inv_round_terms', 'major_investor_threshold_amount'),
        500,
      ),
    ).toBe('');
  });

  it('normalizes website edits to the stored bare domain', () => {
    expect(
      toStoredValue(
        'https://www.example.com/path',
        fieldFor('inv_company', 'domain'),
        undefined,
        undefined,
      ),
    ).toBe('example.com');
  });
});

describe('buildEditValueSchema — numeric Legal Terms fields', () => {
  it('rejects blank input, so a value can be changed but not cleared', () => {
    for (const [entityType, fieldKey] of [
      ['inv_round_terms', 'major_investor_threshold_amount'],
      ['inv_round_terms', 'major_investor_threshold_shares'],
      ['inv_security_terms', 'liquidation_seniority'],
    ] as const) {
      const schema = buildEditValueSchema(fieldFor(entityType, fieldKey));
      expect(parseValue(schema, '').success).toBe(false);
    }
  });

  it('takes a threshold ownership percent unscaled (stored as percent points)', () => {
    const schema = buildEditValueSchema(
      fieldFor('inv_round_terms', 'major_investor_threshold_ownership_pct'),
    );
    expect(parseValue(schema, '5').success).toBe(true);
    expect(parseValue(schema, '101').success).toBe(false);
  });

  it('rejects a dividend rate the display would render 100x too large', () => {
    const schema = buildEditValueSchema(
      fieldFor('inv_security_terms', 'dividend_rate'),
    );
    expect(parseValue(schema, '8').success).toBe(true);
    expect(parseValue(schema, '0.5').success).toBe(false);
  });
});

describe('buildEditValueSchema — justification validation', () => {
  it('accepts an empty justification (optional)', () => {
    expect(
      numberSchema().safeParse({ value: '100', justification: '' }).success,
    ).toBe(true);
  });

  it('rejects a justification longer than 500 chars', () => {
    expect(
      numberSchema().safeParse({
        value: '100',
        justification: 'x'.repeat(501),
      }).success,
    ).toBe(false);
  });
});
