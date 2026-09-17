import {
  resolveField,
  resolveRows,
} from '@/lib/v2/employee-import/resolve-rows';
import type {
  EmployeeImportMapping,
  FieldRule,
  SheetRow,
} from '@/lib/v2/employee-import/types';

const TODAY = '2026-08-17';

function mapping(
  fields: EmployeeImportMapping['fields'],
  overrides: Partial<EmployeeImportMapping> = {},
): EmployeeImportMapping {
  return {
    version: 1,
    hasHeaderRow: false,
    fields,
    ...overrides,
  };
}

describe('resolveField', () => {
  const costCenter: FieldRule = {
    sources: [{ index: 6 }, { index: 7 }],
    separator: ' - ',
  };

  it('joins a numeric code with its label', () => {
    const row: SheetRow = [];
    row[6] = 70133;
    row[7] = 'Sales Trading Equities LD';
    expect(resolveField(row, costCenter).value).toBe(
      '70133 - Sales Trading Equities LD',
    );
  });

  it('drops a blank trailing part instead of leaving a dangling separator', () => {
    const row: SheetRow = [];
    row[6] = 70133;
    row[7] = null;
    expect(resolveField(row, costCenter).value).toBe('70133');
  });

  it('returns empty rather than a bare separator when both parts are blank', () => {
    expect(resolveField([], costCenter).value).toBe('');
  });

  describe('the zero rule', () => {
    const department: FieldRule = {
      sources: [{ index: 26, required: true }, { index: 27 }],
      separator: ' - ',
    };

    it('blanks the whole field when the required code is 0', () => {
      const row: SheetRow = [];
      row[26] = 0;
      row[27] = 'Equity Sales Trading Europe';
      expect(resolveField(row, department).value).toBe('');
    });

    it('joins normally when the required code is non-zero', () => {
      const row: SheetRow = [];
      row[26] = 830200;
      row[27] = 'Equity Sales Trading Europe';
      expect(resolveField(row, department).value).toBe(
        '830200 - Equity Sales Trading Europe',
      );
    });

    it('blanks the field when the required source is empty', () => {
      const row: SheetRow = [];
      row[27] = 'Equity Sales Trading Europe';
      expect(resolveField(row, department).value).toBe('');
    });
  });

  describe('value maps', () => {
    const entity: FieldRule = {
      sources: [{ index: 15 }],
      valueMap: { 'joh. berenberg': 'Berenberg KG' },
    };

    it.each(['Joh. Berenberg', 'joh. berenberg', '  JOH. BERENBERG  '])(
      'matches %p case- and whitespace-insensitively',
      (input) => {
        expect(resolveField([...Array(15), input], entity).value).toBe(
          'Berenberg KG',
        );
      },
    );

    it('passes a value with no entry through unchanged', () => {
      const result = resolveField([...Array(15), 'Other Entity'], entity);
      expect(result.value).toBe('Other Entity');
      expect(result.sourceValue).toBe('Other Entity');
    });

    // Regression: the source value used to go unreported when no map existed,
    // which left the mapping editor with nothing to list.
    it('reports the source value even with no value map configured', () => {
      const result = resolveField([...Array(15), 'London'], {
        sources: [{ index: 15 }],
      });
      expect(result.sourceValue).toBe('London');
      expect(result.value).toBe('London');
    });
  });
});

describe('resolveRows', () => {
  it('lets one source column feed two fields, raw and mapped', () => {
    const row: SheetRow = [];
    row[2] = 'User 1';
    row[3] = 'LDN';
    row[15] = 'London';

    const { rows } = resolveRows(
      [row],
      mapping({
        first_name: { sources: [{ index: 2 }] },
        last_name: { sources: [{ index: 3 }] },
        region: { sources: [{ index: 15 }] },
        country: {
          sources: [{ index: 15 }],
          valueMap: { london: 'GBR' },
        },
      }),
      { today: TODAY },
    );

    expect(rows[0].region).toBe('London');
    expect(rows[0].country).toBe('GBR');
  });

  // Row 3 of the real file: department code 0 but a real team code.
  it('blanks Department on a zero code while Team still resolves', () => {
    const row: SheetRow = [];
    row[2] = 'User 3';
    row[3] = 'LDN';
    row[26] = 0;
    row[28] = 810122;
    row[29] = 'Food Manufacturing & HPC';

    const { rows } = resolveRows(
      [row],
      mapping({
        first_name: { sources: [{ index: 2 }] },
        last_name: { sources: [{ index: 3 }] },
        department: {
          sources: [{ index: 26, required: true }, { index: 27 }],
        },
        team: { sources: [{ index: 28, required: true }, { index: 29 }] },
      }),
      { today: TODAY },
    );

    expect(rows[0].department).toBe('');
    expect(rows[0].team).toBe('810122 - Food Manufacturing & HPC');
  });

  describe('status derivation', () => {
    const buildRow = (leaveDate: Date | null): SheetRow => {
      const row: SheetRow = [];
      row[2] = 'User';
      row[3] = 'Name';
      row[5] = leaveDate;
      return row;
    };

    const statusMapping = mapping({
      first_name: { sources: [{ index: 2 }] },
      last_name: { sources: [{ index: 3 }] },
      leave_date: { sources: [{ index: 5 }] },
    });

    it('marks a past leave date inactive', () => {
      const { rows } = resolveRows(
        [buildRow(new Date(Date.UTC(2026, 5, 21)))],
        statusMapping,
        { today: TODAY },
      );
      expect(rows[0].leave_date).toBe('2026-06-21');
      expect(rows[0].status).toBe('inactive');
    });

    it('leaves status unset for a future leave date', () => {
      const { rows } = resolveRows(
        [buildRow(new Date(Date.UTC(2026, 11, 1)))],
        statusMapping,
        { today: TODAY },
      );
      expect(rows[0].status).toBeUndefined();
    });

    it('leaves status unset when there is no leave date', () => {
      const { rows } = resolveRows([buildRow(null)], statusMapping, {
        today: TODAY,
      });
      expect(rows[0].status).toBeUndefined();
    });
  });

  it('splits a full name and reports missing names as invalid', () => {
    const rows: SheetRow[] = [['Ada Lovelace'], ['Prince'], ['']];

    const result = resolveRows(
      rows,
      mapping({ full_name: { sources: [{ index: 0 }] } }),
      { today: TODAY },
    );

    expect(result.rows[0]).toMatchObject({
      first_name: 'Ada',
      last_name: 'Lovelace',
      isValid: true,
    });
    expect(result.rows[1]).toMatchObject({
      first_name: 'Prince',
      last_name: '',
      isValid: false,
      invalidReasons: ['Missing last name'],
    });
    expect(result.rows[2].invalidReasons).toEqual([
      'Missing first name',
      'Missing last name',
    ]);
  });

  it('skips the header row and numbers rows from 2 when hasHeaderRow', () => {
    const rows: SheetRow[] = [
      ['First Name', 'Last Name'],
      ['Ada', 'Lovelace'],
    ];

    const { rows: resolved } = resolveRows(
      rows,
      mapping(
        {
          first_name: { sources: [{ index: 0 }] },
          last_name: { sources: [{ index: 1 }] },
        },
        { hasHeaderRow: true },
      ),
      { today: TODAY },
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      rowNumber: 2,
      first_name: 'Ada',
      last_name: 'Lovelace',
    });
  });

  it('flags impossible dates as invalid instead of importing them', () => {
    const row: SheetRow = [];
    row[2] = 'User';
    row[3] = 'Name';
    row[4] = '31/02/2024';
    row[5] = '29/02/2023';

    const { rows } = resolveRows(
      [row],
      mapping({
        first_name: { sources: [{ index: 2 }] },
        last_name: { sources: [{ index: 3 }] },
        start_date: { sources: [{ index: 4 }] },
        leave_date: { sources: [{ index: 5 }] },
      }),
      { today: TODAY },
    );

    expect(rows[0].isValid).toBe(false);
    expect(rows[0].invalidReasons).toEqual([
      'Invalid start date: "31/02/2024"',
      'Invalid leave date: "29/02/2023"',
    ]);
    // An unusable leave date must not drive a status change.
    expect(rows[0].status).toBeUndefined();
  });

  it('caps distinct collected values per field at 200', () => {
    const rows: SheetRow[] = Array.from({ length: 250 }, (_, i) => [
      'User',
      'Name',
      `Division ${i}`,
    ]);

    const { sourceValues } = resolveRows(
      rows,
      mapping({
        first_name: { sources: [{ index: 0 }] },
        last_name: { sources: [{ index: 1 }] },
        division: { sources: [{ index: 2 }] },
        business_group: { sources: [], deriveFrom: 'division' },
      }),
      { today: TODAY },
    );

    expect(sourceValues.business_group).toHaveLength(200);
    // The cap keeps the first values seen and ignores the rest.
    expect(sourceValues.business_group?.[0]).toBe('Division 0');
    expect(sourceValues.business_group).not.toContain('Division 200');
  });

  it('collects distinct source values for a value-mappable field', () => {
    const rows: SheetRow[] = [
      ['A', 'B', 'Zentralbereich Investment Bank'],
      ['C', 'D', 'Zentralbereich Investment Bank'],
      ['E', 'F', 'Tax'],
      ['G', 'H', 'Legal'],
    ];

    const { sourceValues } = resolveRows(
      rows,
      mapping({
        first_name: { sources: [{ index: 0 }] },
        last_name: { sources: [{ index: 1 }] },
        division: { sources: [{ index: 2 }] },
        business_group: { sources: [], deriveFrom: 'division' },
      }),
      { today: TODAY },
    );

    expect(sourceValues.business_group).toEqual([
      'Zentralbereich Investment Bank',
      'Tax',
      'Legal',
    ]);
    // Not value-mappable, so never collected — keeps the payload small.
    expect(sourceValues.division).toBeUndefined();
    expect(sourceValues.first_name).toBeUndefined();
  });
});
