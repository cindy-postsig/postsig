jest.mock('@/lib/v2/org-units', () => ({
  syncOrgUnitsForEmployees: jest.fn(),
}));

import { parseArgs } from '@/scripts/backfill-org-units';

describe('backfill-org-units parseArgs', () => {
  it('defaults to every organization and .env.local', () => {
    expect(parseArgs([])).toEqual({ org: null, envPath: '.env.local' });
  });

  it('reads --org and --env values', () => {
    expect(parseArgs(['--org', 'org-1', '--env', '.env.prod'])).toEqual({
      org: 'org-1',
      envPath: '.env.prod',
    });
  });

  // A bare --org used to fall through to null, which widens a production
  // backfill from one tenant to all of them.
  it('rejects --org without a value', () => {
    expect(() => parseArgs(['--org'])).toThrow('--org requires a value');
  });

  it('rejects --env without a value', () => {
    expect(() => parseArgs(['--env'])).toThrow('--env requires a value');
  });

  it('rejects an option used as another option’s value', () => {
    expect(() => parseArgs(['--org', '--env', '.env.prod'])).toThrow(
      '--org requires a value',
    );
  });

  it('rejects unknown arguments', () => {
    expect(() => parseArgs(['--dry-run'])).toThrow(
      'Unknown argument: --dry-run',
    );
  });
});
