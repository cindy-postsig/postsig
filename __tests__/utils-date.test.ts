import { formatDateTime } from '@/utils/date';

/**
 * `formatDateTime` backs the shared "Uploaded on" / "Submitted on" document
 * columns in both IRI and CPM, so its date part has to follow the viewer's
 * effective date-format pattern.
 */
describe('formatDateTime', () => {
  // In the past, well clear of the one-hour relative-phrase window.
  const OLD = new Date(2020, 11, 31, 16, 32).toISOString();

  it('orders the date part per the given pattern', () => {
    const { text, isRecent } = formatDateTime(OLD, 'dd/MM/yyyy');
    expect(isRecent).toBe(false);
    expect(text.startsWith('31/12/2020, ')).toBe(true);
    expect(text).toMatch(/, \d{1,2}:\d{2}\s?(AM|PM)$/i);
  });

  it('respects month-first and dot-separated patterns', () => {
    expect(
      formatDateTime(OLD, 'MM/dd/yyyy').text.startsWith('12/31/2020, '),
    ).toBe(true);
    expect(
      formatDateTime(OLD, 'yyyy.MM.dd').text.startsWith('2020.12.31, '),
    ).toBe(true);
  });

  it('falls back to the default pattern when none is given', () => {
    expect(formatDateTime(OLD).text.startsWith('2020-12-31, ')).toBe(true);
  });

  it('still prefers a relative phrase within the last hour', () => {
    const { text, isRecent } = formatDateTime(
      new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      'dd/MM/yyyy',
    );
    expect(isRecent).toBe(true);
    expect(text).toMatch(/ago$/);
  });
});
