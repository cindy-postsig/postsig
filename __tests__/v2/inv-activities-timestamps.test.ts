// __tests__/v2/inv-activities-timestamps.test.ts
import { normalizeToUtc } from '@/lib/v2/inv/activity-time';

describe('normalizeToUtc', () => {
  it('appends Z to a timezone-less ISO timestamp', () => {
    // `activities.created_at` is `timestamp without time zone` stored in UTC;
    // without a marker the browser would parse it as local time.
    expect(normalizeToUtc('2026-07-08T12:34:56')).toBe('2026-07-08T12:34:56Z');
    expect(normalizeToUtc('2026-07-08T12:34:56.789')).toBe(
      '2026-07-08T12:34:56.789Z',
    );
    // Space-separated form (Postgres text output) is also tagged.
    expect(normalizeToUtc('2026-07-08 12:34:56')).toBe('2026-07-08 12:34:56Z');
  });

  it('leaves values that already carry a timezone untouched', () => {
    expect(normalizeToUtc('2026-07-08T12:34:56Z')).toBe('2026-07-08T12:34:56Z');
    expect(normalizeToUtc('2026-07-08T12:34:56+00:00')).toBe(
      '2026-07-08T12:34:56+00:00',
    );
    expect(normalizeToUtc('2026-07-08T12:34:56-05:00')).toBe(
      '2026-07-08T12:34:56-05:00',
    );
  });

  it('passes through empty and non-timestamp strings unchanged', () => {
    expect(normalizeToUtc('')).toBe('');
    expect(normalizeToUtc('2026-07-08')).toBe('2026-07-08');
    expect(normalizeToUtc('not a date')).toBe('not a date');
  });
});
