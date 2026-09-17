import { describe, expect, it } from '@jest/globals';
import {
  canSendReminder,
  requestProgressPercent,
} from '@/lib/v2/kpis/transforms';

const NOW = new Date('2026-07-07T12:00:00Z');
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

describe('canSendReminder', () => {
  it('allows a reminder 3+ days after sending with no activity', () => {
    expect(
      canSendReminder(
        { sentAt: daysAgo(3), lastReminderAt: null, filledCount: 0 },
        NOW,
      ),
    ).toBe(true);
  });

  it('blocks a reminder within 3 days of sending', () => {
    expect(
      canSendReminder(
        { sentAt: daysAgo(2.9), lastReminderAt: null, filledCount: 0 },
        NOW,
      ),
    ).toBe(false);
  });

  it('blocks once the recipient has started filling', () => {
    expect(
      canSendReminder(
        { sentAt: daysAgo(10), lastReminderAt: null, filledCount: 2 },
        NOW,
      ),
    ).toBe(false);
  });

  it('rate-limits by the last reminder, not the original send', () => {
    expect(
      canSendReminder(
        { sentAt: daysAgo(10), lastReminderAt: daysAgo(1), filledCount: 0 },
        NOW,
      ),
    ).toBe(false);
    expect(
      canSendReminder(
        { sentAt: daysAgo(10), lastReminderAt: daysAgo(3), filledCount: 0 },
        NOW,
      ),
    ).toBe(true);
  });

  it('blocks when the request was never sent', () => {
    expect(
      canSendReminder(
        { sentAt: null, lastReminderAt: null, filledCount: 0 },
        NOW,
      ),
    ).toBe(false);
  });
});

describe('requestProgressPercent', () => {
  it('rounds the fill ratio to a whole percent', () => {
    expect(requestProgressPercent(1, 3)).toBe(33);
    expect(requestProgressPercent(2, 3)).toBe(67);
    expect(requestProgressPercent(3, 3)).toBe(100);
  });

  it('clamps overfilled submissions to 100', () => {
    // The draft submission is period-scoped, so a recipient can save more
    // values than this request asked for.
    expect(requestProgressPercent(9, 6)).toBe(100);
  });

  it('returns 0 for an empty or item-less request', () => {
    expect(requestProgressPercent(0, 6)).toBe(0);
    expect(requestProgressPercent(0, 0)).toBe(0);
  });
});
