// __tests__/v2/inv-overrides-registry.test.ts
import {
  COMPUTED_METRIC_INPUTS,
  EDITABLE_FIELDS,
  findFieldOption,
  getEditableField,
  getMetricInputFields,
  getOptionLabel,
  isEditableField,
} from '@/lib/v2/inv/overrides/registry';

const ALL_METRIC_INPUT_REFS = Object.values(COMPUTED_METRIC_INPUTS).flatMap(
  (refs) => [...refs],
);

function refKey(ref: { entityType: string; fieldKey: string }): string {
  return `${ref.entityType}:${ref.fieldKey}`;
}

describe('investor overrides registry', () => {
  describe('getEditableField / isEditableField', () => {
    it('returns registered transaction fields', () => {
      const field = getEditableField('inv_transaction', 'amount');
      expect(field).toBeDefined();
      expect(field?.entityType).toBe('inv_transaction');
      expect(field?.fieldKey).toBe('amount');
      expect(field?.dataType).toBe('number');
      expect(field?.entityIdResolution).toBe('transaction_row_id');
    });

    it('returns registered cap table snapshot fields', () => {
      const field = getEditableField(
        'inv_cap_table_snapshot',
        'implied_valuation',
      );
      expect(field).toBeDefined();
      expect(field?.entityIdResolution).toBe('latest_cap_table_snapshot_id');
    });

    it('returns the registered board seat type field', () => {
      const field = getEditableField('inv_board_seat', 'seat_type');
      expect(field).toBeDefined();
      expect(field?.entityType).toBe('inv_board_seat');
      expect(field?.entityIdResolution).toBe('board_seat_row_id');
    });

    it('returns registered company detail fields', () => {
      const industry = getEditableField('inv_company', 'industry');
      const domain = getEditableField('inv_company', 'domain');

      expect(industry?.label).toBe('Industry');
      expect(industry?.entityIdResolution).toBe('company_row_id');
      expect(domain?.label).toBe('Website');
      expect(domain?.entityIdResolution).toBe('company_row_id');
    });

    it('registers every Company Details field', () => {
      const companyFields = EDITABLE_FIELDS.filter(
        (f) => f.entityType === 'inv_company',
      );

      expect(companyFields.map((f) => f.fieldKey).sort()).toEqual([
        'domain',
        'entity_type',
        'founded_year',
        'headquarters',
        'industry',
        'legal_jurisdiction',
        'sector',
      ]);
      for (const field of companyFields) {
        expect(field.entityIdResolution).toBe('company_row_id');
      }
    });

    it('rejects non-registered fields', () => {
      // Real column, deliberately excluded from v1
      expect(isEditableField('inv_transaction', 'transaction_type')).toBe(
        false,
      );
      // Real column on a non-registered entity
      expect(isEditableField('inv_financing_round', 'total_raised')).toBe(
        false,
      );
      // Invented field
      expect(getEditableField('inv_transaction', 'made_up')).toBeUndefined();
      // Field registered on a different entity type
      expect(isEditableField('inv_transaction', 'implied_valuation')).toBe(
        false,
      );
      // Computed view columns are never editable
      expect(isEditableField('v_inv_company_valuation', 'multiple')).toBe(
        false,
      );
      // About/description is displayed but not user-editable.
      expect(isEditableField('inv_company', 'description')).toBe(false);
    });
  });

  describe('validation rules', () => {
    it('amount accepts finite numbers including negatives', () => {
      const rule = getEditableField('inv_transaction', 'amount')!.rule;
      expect(rule.safeParse(1500000).success).toBe(true);
      expect(rule.safeParse(-250000).success).toBe(true);
      expect(rule.safeParse(Infinity).success).toBe(false);
      expect(rule.safeParse('1500000').success).toBe(false);
    });

    it('transaction_date requires a valid YYYY-MM-DD string', () => {
      const rule = getEditableField(
        'inv_transaction',
        'transaction_date',
      )!.rule;
      expect(rule.safeParse('2025-03-14').success).toBe(true);
      expect(rule.safeParse('03/14/2025').success).toBe(false);
      expect(rule.safeParse('2025-13-99').success).toBe(false);
      expect(rule.safeParse(20250314).success).toBe(false);
    });

    it('implied_valuation and share_price reject negatives', () => {
      const valuation = getEditableField(
        'inv_cap_table_snapshot',
        'implied_valuation',
      )!.rule;
      expect(valuation.safeParse(10000000).success).toBe(true);
      expect(valuation.safeParse(-1).success).toBe(false);

      const price = getEditableField(
        'inv_cap_table_snapshot',
        'share_price',
      )!.rule;
      expect(price.safeParse(12.5).success).toBe(true);
      expect(price.safeParse(-0.01).success).toBe(false);
    });

    it('our_fd_ownership_percent is a fraction between 0 and 1', () => {
      const rule = getEditableField(
        'inv_cap_table_snapshot',
        'our_fd_ownership_percent',
      )!.rule;
      expect(rule.safeParse(0.125).success).toBe(true);
      expect(rule.safeParse(1).success).toBe(true);
      // 12.5 looks like a percent — stored values are fractions
      expect(rule.safeParse(12.5).success).toBe(false);
      expect(rule.safeParse(-0.1).success).toBe(false);
    });

    it('seat_type only accepts the CHECK constraint values', () => {
      const rule = getEditableField('inv_board_seat', 'seat_type')!.rule;
      expect(rule.safeParse('investor_designated').success).toBe(true);
      expect(rule.safeParse('independent').success).toBe(true);
      expect(rule.safeParse('observer').success).toBe(true);
      expect(rule.safeParse('executive').success).toBe(true);
      expect(rule.safeParse('director').success).toBe(false);
      expect(rule.safeParse('').success).toBe(false);
    });

    it('company detail fields accept stored text and domains', () => {
      const industry = getEditableField('inv_company', 'industry')!.rule;
      const domain = getEditableField('inv_company', 'domain')!.rule;

      expect(industry.safeParse('Healthcare').success).toBe(true);
      expect(industry.safeParse('').success).toBe(false);
      expect(domain.safeParse('example.com').success).toBe(true);
      expect(domain.safeParse('https://example.com').success).toBe(false);
      expect(domain.safeParse('not-a-domain').success).toBe(false);
    });

    it('the remaining company metadata fields accept free text', () => {
      for (const fieldKey of [
        'sector',
        'headquarters',
        'entity_type',
        'legal_jurisdiction',
      ]) {
        const rule = getEditableField('inv_company', fieldKey)!.rule;
        expect(rule.safeParse('Delaware C-Corp').success).toBe(true);
        expect(rule.safeParse('   ').success).toBe(false);
      }
    });

    it('founded_year accepts only in-range whole years', () => {
      const rule = getEditableField('inv_company', 'founded_year')!.rule;

      expect(rule.safeParse(2015).success).toBe(true);
      expect(rule.safeParse(1800).success).toBe(true);
      expect(rule.safeParse(2100).success).toBe(true);
      expect(rule.safeParse(1799).success).toBe(false);
      expect(rule.safeParse(2101).success).toBe(false);
      expect(rule.safeParse(2015.5).success).toBe(false);
      expect(rule.safeParse('2015').success).toBe(false);
    });
  });

  describe('computed metric inputs', () => {
    it.each(ALL_METRIC_INPUT_REFS)(
      'metric input $entityType.$fieldKey resolves to a registered editable field',
      (ref) => {
        expect(isEditableField(ref.entityType, ref.fieldKey)).toBe(true);
      },
    );

    it('my_fmv lists its snapshot inputs', () => {
      const inputs = getMetricInputFields('my_fmv');
      expect(inputs?.map((f) => f.fieldKey).sort()).toEqual([
        'implied_valuation',
        'our_fd_ownership_percent',
      ]);
    });

    it('aggregate_cost has no editable inputs (transaction-derived, not in the panel)', () => {
      expect(getMetricInputFields('aggregate_cost')).toBeUndefined();
    });

    it('moic lists only its snapshot inputs (its cost leg is transaction-derived)', () => {
      const moic = getMetricInputFields('moic')!.map((f) => f.fieldKey);
      expect(moic.sort()).toEqual([
        'implied_valuation',
        'our_fd_ownership_percent',
      ]);
    });

    it('no metric input references a transaction field (panel edits snapshots only)', () => {
      expect(
        ALL_METRIC_INPUT_REFS.some((r) => r.entityType === 'inv_transaction'),
      ).toBe(false);
    });

    it('unknown metrics get no inputs (read-only, no edit affordance)', () => {
      expect(getMetricInputFields('post_money_valuation')).toBeUndefined();
      expect(getMetricInputFields('irr')).toBeUndefined();
    });

    it('inherited prototype keys are not treated as metrics', () => {
      expect(getMetricInputFields('toString')).toBeUndefined();
      expect(getMetricInputFields('constructor')).toBeUndefined();
    });
  });

  describe('registry shape', () => {
    it('has no duplicate (entityType, fieldKey) entries', () => {
      const keys = EDITABLE_FIELDS.map(refKey);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('has no duplicate labels beyond the known pre-existing pair', () => {
      // ActivityContent resolves audit-log field names through the registry, so
      // two fields sharing a label render indistinguishable history rows.
      // 'My Units' is a pre-existing collision (inv_transaction.units and
      // inv_cap_table_snapshot.our_total_shares); renaming either would
      // retroactively relabel historic audit entries, so it stays. Any NEW
      // collision should fail here.
      const labels = EDITABLE_FIELDS.map((f) => f.label);
      const duplicates = labels.filter(
        (label, i) => labels.indexOf(label) !== i,
      );
      expect(duplicates).toEqual(['My Units']);
    });

    it('covers the supported entity types', () => {
      const entityTypes = new Set(EDITABLE_FIELDS.map((f) => f.entityType));
      expect([...entityTypes].sort()).toEqual([
        'inv_board_seat',
        'inv_cap_table_snapshot',
        'inv_company',
        'inv_information_rights',
        'inv_round_terms',
        'inv_security_terms',
        'inv_transaction',
      ]);
    });

    // Mirrors ENTITY_TYPES in postsig-droid
    // packages/inv-transactions/src/schemas/value-override.ts. droid rejects any
    // entity type outside that enum, so a field registered here for a type droid
    // does not know would 400 on save.
    it('only uses entity types droid accepts', () => {
      const droidEntityTypes = new Set([
        'inv_transaction',
        'inv_cap_table_snapshot',
        'inv_security',
        'inv_fund',
        'inv_financing_round',
        'inv_company',
        'inv_board_seat',
        'inv_round_terms',
        'inv_information_rights',
        'inv_security_terms',
      ]);
      for (const field of EDITABLE_FIELDS) {
        expect(droidEntityTypes.has(field.entityType)).toBe(true);
      }
    });
  });

  describe('fixed-choice (options) fields', () => {
    const optionFields = EDITABLE_FIELDS.filter((f) => f.options);

    it('registers the two coded Legal Terms fields', () => {
      expect(optionFields.map((f) => f.fieldKey).sort()).toEqual([
        'anti_dilution_type',
        'dividend_seniority',
      ]);
    });

    // applyOverrides re-validates every stored override against its rule on
    // read and silently drops failures — so an option whose value does not
    // satisfy its own rule would make edits vanish after saving.
    it('every option value satisfies its own field rule', () => {
      for (const field of optionFields) {
        for (const option of field.options ?? []) {
          expect(field.rule.safeParse(option.value).success).toBe(true);
        }
      }
    });

    it('every option value matches its field dataType', () => {
      for (const field of optionFields) {
        for (const option of field.options ?? []) {
          expect(typeof option.value).toBe(
            field.dataType === 'number' ? 'number' : 'string',
          );
        }
      }
    });

    it('maps a stored code to its display label', () => {
      const antiDilution = getEditableField(
        'inv_security_terms',
        'anti_dilution_type',
      );
      const seniority = getEditableField(
        'inv_security_terms',
        'dividend_seniority',
      );
      expect(getOptionLabel(antiDilution!, 'broad_based')).toBe(
        'Broad-Based Weighted Average',
      );
      expect(getOptionLabel(seniority!, 2)).toBe('Pari Passu');
    });

    // The same value reaches label lookup from a jsonb column, an audit row and a
    // form field, so a numeric rank can arrive as 2 or '2'.
    it('resolves an option regardless of the value’s type', () => {
      const seniority = getEditableField(
        'inv_security_terms',
        'dividend_seniority',
      );
      expect(findFieldOption(seniority!, 2)?.label).toBe('Pari Passu');
      expect(findFieldOption(seniority!, '2')?.label).toBe('Pari Passu');
      expect(getOptionLabel(seniority!, '2')).toBe('Pari Passu');
    });

    it('returns undefined from findFieldOption for an unmapped value', () => {
      const antiDilution = getEditableField(
        'inv_security_terms',
        'anti_dilution_type',
      );
      // Distinguishable from getOptionLabel, whose fallback looks like a label.
      expect(
        findFieldOption(antiDilution!, 'weighted_average'),
      ).toBeUndefined();
      expect(findFieldOption(antiDilution!, '')).toBeUndefined();
    });

    // Both rules are derived from their options list, so a value absent from the
    // dropdown can never validate.
    it('rejects any value outside the options list', () => {
      const seniority = getEditableField(
        'inv_security_terms',
        'dividend_seniority',
      );
      const antiDilution = getEditableField(
        'inv_security_terms',
        'anti_dilution_type',
      );
      expect(seniority?.rule.safeParse(4).success).toBe(false);
      expect(seniority?.rule.safeParse(0).success).toBe(false);
      expect(antiDilution?.rule.safeParse('weighted_average').success).toBe(
        false,
      );
      expect(antiDilution?.rule.safeParse('').success).toBe(false);
    });

    it('falls back to the raw value for an unknown code', () => {
      const antiDilution = getEditableField(
        'inv_security_terms',
        'anti_dilution_type',
      );
      expect(getOptionLabel(antiDilution!, 'weighted_average')).toBe(
        'weighted_average',
      );
    });

    it('rejects the display label as a stored value', () => {
      const antiDilution = getEditableField(
        'inv_security_terms',
        'anti_dilution_type',
      );
      expect(
        antiDilution?.rule.safeParse('Broad-Based Weighted Average').success,
      ).toBe(false);
      expect(antiDilution?.rule.safeParse('broad_based').success).toBe(true);
    });
  });

  describe('Legal Terms numeric fields', () => {
    // displayAsPercent divides by 100 on write and re-multiplies on read. These
    // columns already store percent points, so setting it would persist a value
    // 100x too small while looking correct on screen.
    it('never sets displayAsPercent on a percent-point column', () => {
      for (const entityType of [
        'inv_round_terms',
        'inv_information_rights',
        'inv_security_terms',
      ]) {
        const fields = EDITABLE_FIELDS.filter(
          (f) => f.entityType === entityType,
        );
        for (const field of fields) {
          expect(field.displayAsPercent).toBeUndefined();
        }
      }
    });

    it.each([
      ['major_investor_threshold_amount', 250_000, -1],
      ['major_investor_threshold_ownership_pct', 5, 101],
      ['major_investor_threshold_shares', 1_000, 1.5],
    ])('%s accepts %p and rejects %p', (fieldKey, valid, invalid) => {
      const field = getEditableField('inv_round_terms', fieldKey);
      expect(field?.rule.safeParse(valid).success).toBe(true);
      expect(field?.rule.safeParse(invalid).success).toBe(false);
    });

    // Derived from the registry rather than a hardcoded list so a numeric field
    // added to any Legal Terms section is covered without touching this test.
    // Legal Terms numerics are editable but never clearable — a blank must be
    // rejected by the rule itself, not only by the form.
    it('rejects blank input on every numeric Legal Terms field', () => {
      const numericFields = EDITABLE_FIELDS.filter(
        (f) =>
          f.dataType === 'number' &&
          (
            [
              'inv_round_terms',
              'inv_information_rights',
              'inv_security_terms',
            ] as const
          ).some((t) => t === f.entityType),
      );

      // Guard against the filter silently matching nothing.
      expect(numericFields.length).toBeGreaterThan(0);

      for (const field of numericFields) {
        expect(field.rule.safeParse('').success).toBe(false);
        expect(field.rule.safeParse(null).success).toBe(false);
      }
    });

    // normalizeRatePercent rescales any stored rate below 1 by 100, so a stored
    // 0.5 meaning 0.5% would render as 50%. The rule rejects that interval
    // rather than persist a value the page shows wrong.
    it('dividend_rate rejects the unrenderable (0, 1) interval', () => {
      const field = getEditableField('inv_security_terms', 'dividend_rate');
      expect(field?.rule.safeParse(8).success).toBe(true);
      expect(field?.rule.safeParse(0).success).toBe(true);
      expect(field?.rule.safeParse(0.5).success).toBe(false);
      expect(field?.rule.safeParse(120).success).toBe(false);
    });

    it('liquidation_seniority takes a positive integer rank', () => {
      const field = getEditableField(
        'inv_security_terms',
        'liquidation_seniority',
      );
      expect(field?.rule.safeParse(1).success).toBe(true);
      expect(field?.rule.safeParse(0).success).toBe(false);
      expect(field?.rule.safeParse(1.5).success).toBe(false);
    });
  });

  describe('Information Rights grid fields', () => {
    it('registers every backed cell of the grid', () => {
      const registered = EDITABLE_FIELDS.filter(
        (f) => f.entityType === 'inv_information_rights',
      ).map((f) => f.fieldKey);
      for (const fieldKey of [
        'year_end_budget_business_plan',
        'monthly_cap_table',
        'quarterly_cap_table',
        'year_end_cap_table',
        'monthly_balance_sheet',
        'quarterly_balance_sheet',
        'year_end_balance_sheet',
        'monthly_income_cash_flows',
        'quarterly_income_cash_flows',
        'year_end_income_cash_flows',
        'audited_monthly',
        'audited_quarterly',
        'audited_year_end',
      ]) {
        expect(registered).toContain(fieldKey);
      }
    });

    // Each audited_* column backs four displayed rows, so the popup must say so.
    it('warns that the audited columns are shared by four rows', () => {
      for (const fieldKey of [
        'audited_monthly',
        'audited_quarterly',
        'audited_year_end',
      ]) {
        const field = getEditableField('inv_information_rights', fieldKey);
        expect(field?.hint).toContain('all four Audited rows');
      }
    });
  });

  describe('investor-status boolean fields', () => {
    it.each([
      [
        'inv_information_rights',
        'is_major_investor',
        'information_rights_row_id',
      ],
      [
        'inv_information_rights',
        'info_rights_for_major',
        'information_rights_row_id',
      ],
      [
        'inv_information_rights',
        'info_rights_for_all',
        'information_rights_row_id',
      ],
      ['inv_round_terms', 'pro_rata_rights_major', 'round_terms_row_id'],
      ['inv_round_terms', 'pro_rata_rights_all', 'round_terms_row_id'],
    ])(
      '%s.%s is a registered boolean field',
      (entityType, fieldKey, resolution) => {
        const field = getEditableField(entityType, fieldKey);
        expect(field).toBeDefined();
        expect(field?.dataType).toBe('boolean');
        expect(field?.entityIdResolution).toBe(resolution);
        expect(field?.rule.safeParse(true).success).toBe(true);
        expect(field?.rule.safeParse(false).success).toBe(true);
        expect(field?.rule.safeParse('yes').success).toBe(false);
        expect(field?.rule.safeParse(1).success).toBe(false);
      },
    );
  });

  describe('other legal terms status fields', () => {
    // The two pro-rata flags are shared with Investor Status and covered above.
    const OTHER_LEGAL_TERM_FIELD_KEYS = [
      'standard_pro_rata_formulation',
      'drag_along',
      'pay_to_play',
      'do_insurance',
      'rofr_cosale',
      'investors_subject_to_rofr',
      'issuer_pays_investor_counsel',
      'employee_vesting_protocol',
      'founder_vesting_applied',
      'required_closing_payments',
      'registration_rights_preferred',
    ];

    it.each(OTHER_LEGAL_TERM_FIELD_KEYS)(
      'inv_round_terms.%s is a registered boolean field',
      (fieldKey) => {
        const field = getEditableField('inv_round_terms', fieldKey);
        expect(field).toBeDefined();
        expect(field?.dataType).toBe('boolean');
        expect(field?.entityIdResolution).toBe('round_terms_row_id');
        expect(field?.rule.safeParse(true).success).toBe(true);
        expect(field?.rule.safeParse(false).success).toBe(true);
        expect(field?.rule.safeParse('yes').success).toBe(false);
        expect(field?.rule.safeParse(1).success).toBe(false);
        expect(field?.rule.safeParse(null).success).toBe(false);
      },
    );

    it('leaves the section’s numeric rows unregistered', () => {
      // Only the Yes/No status flags are editable in Other Legal Terms.
      expect(
        getEditableField('inv_round_terms', 'investor_counsel_fee_cap'),
      ).toBeUndefined();
      expect(
        getEditableField('inv_round_terms', 'subsequent_closing_window_days'),
      ).toBeUndefined();
    });

    it('leaves fields with no displayed value unregistered', () => {
      // redemption_rights is not rendered on any investor page, and
      // named_major_investors is a text[] (override values are scalars only).
      for (const fieldKey of ['redemption_rights', 'named_major_investors']) {
        expect(getEditableField('inv_round_terms', fieldKey)).toBeUndefined();
      }
      // Real columns the Information Rights grid does not read — its
      // "Audited Stockholders Equity" row renders the shared audited_* flags.
      for (const fieldKey of [
        'monthly_stockholders_equity',
        'quarterly_stockholders_equity',
        'year_end_stockholders_equity',
      ]) {
        expect(
          getEditableField('inv_information_rights', fieldKey),
        ).toBeUndefined();
      }
    });
  });
});
