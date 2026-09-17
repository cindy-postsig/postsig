jest.mock('@/data/users', () => ({ getUserMetadata: jest.fn() }));
jest.mock('@/lib/v2/bloomberg-sid/queries', () => ({
  fetchHrEmployees: jest.fn(),
}));

import type { SidHrEmployee } from '@/lib/v2/bloomberg-sid/report';
import { seatRoster } from '@/lib/v2/seats/roster';

const employee = (
  id: number,
  firstName: string,
  lastName: string,
  status = 'active',
): SidHrEmployee => ({
  id,
  firstName,
  lastName,
  department: null,
  costCenter: null,
  orgUnitId: null,
  status,
});

const ROSTER = [
  employee(1, 'Ada', 'Lovelace'),
  employee(2, 'Bob', 'Builder', 'inactive'),
  employee(3, 'Cy', 'Twombly', 'on_leave'),
  employee(4, 'Dee', 'Unique'),
  employee(5, 'Ed', 'Shared'),
  employee(6, 'Eve', 'Shared'),
];

describe('seatRoster', () => {
  describe('for an org with no roster', () => {
    const roster = seatRoster([]);

    it('counts every seat, linked or not', () => {
      expect(roster.isActiveEmployee(1)).toBe(true);
      expect(roster.isActiveEmployee(null)).toBe(true);
    });

    it('counts every name', () => {
      expect(roster.matchActiveNames(['nobody'])('nobody')).toBe(true);
    });
  });

  describe('by employee id', () => {
    const roster = seatRoster(ROSTER);

    it('is active for status active only', () => {
      expect(roster.isActiveEmployee(1)).toBe(true);
      expect(roster.isActiveEmployee(2)).toBe(false);
      expect(roster.isActiveEmployee(3)).toBe(false);
    });

    it('is nobody for an unlinked seat or an id the roster lacks', () => {
      expect(roster.isActiveEmployee(null)).toBe(false);
      expect(roster.isActiveEmployee(99)).toBe(false);
    });
  });

  describe('by name', () => {
    const isActive = seatRoster(ROSTER).matchActiveNames([
      'ada lovelace',
      'BOB BUILDER',
      'x unique',
      'y shared',
      'PROXYUSER BMDS1_2',
    ]);

    it('matches a full name regardless of case', () => {
      expect(isActive('ada lovelace')).toBe(true);
    });

    it('rejects a match whose status is not active', () => {
      expect(isActive('BOB BUILDER')).toBe(false);
    });

    it('falls back to a unique surname', () => {
      expect(isActive('x unique')).toBe(true);
    });

    it('rejects a surname two people share, and a name nobody has', () => {
      expect(isActive('y shared')).toBe(false);
      expect(isActive('PROXYUSER BMDS1_2')).toBe(false);
    });
  });
});
