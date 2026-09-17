import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  parseArgs,
  planMappingUpdates,
  ssoAddArgs,
  ssoListArgs,
  ssoUpdateArgs,
  withTempDir,
  type SsoProvider,
} from '@/scripts/lib/sso-provider';

const REF = 'svnsobdxldmosallfocu';

describe('sso-provider parseArgs', () => {
  it('parses an add command', () => {
    expect(
      parseArgs([
        'add',
        '--project-ref',
        REF,
        '--domain',
        'customer.com',
        '--metadata-url',
        'https://idp.example/metadata.xml',
      ]),
    ).toEqual({
      command: 'add',
      projectRef: REF,
      domain: 'customer.com',
      metadataUrl: 'https://idp.example/metadata.xml',
    });
  });

  it('parses a mapping command with repeated providers and --dry-run', () => {
    expect(
      parseArgs([
        'mapping',
        '--project-ref',
        REF,
        '--provider',
        'p1',
        '--provider',
        'p2',
        '--dry-run',
      ]),
    ).toEqual({
      command: 'mapping',
      projectRef: REF,
      providerIds: ['p1', 'p2'],
      dryRun: true,
    });
  });

  it('defaults mapping to every provider without a dry run', () => {
    expect(parseArgs(['mapping', '--project-ref', REF])).toEqual({
      command: 'mapping',
      projectRef: REF,
      providerIds: [],
      dryRun: false,
    });
  });

  it('rejects an unknown command or flag', () => {
    expect(() => parseArgs([])).toThrow(/Usage/);
    expect(() => parseArgs(['remove', '--project-ref', REF])).toThrow(/Usage/);
    expect(() =>
      parseArgs(['mapping', '--project-ref', REF, '--bogus']),
    ).toThrow('Unknown argument: --bogus');
  });

  it('requires a project ref and flag values', () => {
    expect(() => parseArgs(['mapping'])).toThrow('--project-ref is required');
    expect(() => parseArgs(['mapping', '--project-ref'])).toThrow(
      '--project-ref requires a value',
    );
    expect(() => parseArgs(['mapping', '--project-ref', '--dry-run'])).toThrow(
      '--project-ref requires a value',
    );
  });

  it('requires domain and metadata url for add', () => {
    expect(() =>
      parseArgs(['add', '--project-ref', REF, '--domain', 'customer.com']),
    ).toThrow('add requires --domain and --metadata-url');
  });

  it('rejects flags that belong to the other command', () => {
    expect(() =>
      parseArgs([
        'add',
        '--project-ref',
        REF,
        '--domain',
        'customer.com',
        '--metadata-url',
        'https://idp.example/metadata.xml',
        '--dry-run',
      ]),
    ).toThrow('--provider and --dry-run only apply to mapping');
    expect(() =>
      parseArgs(['mapping', '--project-ref', REF, '--domain', 'customer.com']),
    ).toThrow('--domain and --metadata-url only apply to add');
  });
});

describe('planMappingUpdates', () => {
  const canonical = {
    given_name: { name: 'urn:givenname' },
    family_name: { name: 'urn:surname' },
  };
  const unmapped: SsoProvider = {
    id: 'ci',
    domains: [{ domain: 'ctinnovations.com' }],
    saml: { attribute_mapping: null },
  };
  const staging: SsoProvider = {
    id: 'staging',
    domains: [{ domain: 'cindycorp.onmicrosoft.com' }],
    saml: { attribute_mapping: { keys: { email: { name: 'urn:name' } } } },
  };

  it('adds the canonical keys to a provider with no mapping', () => {
    expect(planMappingUpdates([unmapped], canonical)).toEqual([
      {
        providerId: 'ci',
        domains: ['ctinnovations.com'],
        before: {},
        after: canonical,
        changedKeys: ['given_name', 'family_name'],
      },
    ]);
  });

  it('preserves keys the canonical file does not name', () => {
    const [plan] = planMappingUpdates([staging], canonical);
    expect(plan.after).toEqual({ email: { name: 'urn:name' }, ...canonical });
    expect(plan.changedKeys).toEqual(['given_name', 'family_name']);
  });

  it('reports no change once the canonical keys are present', () => {
    const synced: SsoProvider = {
      ...unmapped,
      saml: {
        attribute_mapping: {
          keys: { ...canonical, email: { name: 'urn:mail' } },
        },
      },
    };
    expect(planMappingUpdates([synced], canonical)[0].changedKeys).toEqual([]);
  });

  it('flags a canonical key whose claim differs', () => {
    const drifted: SsoProvider = {
      ...unmapped,
      saml: {
        attribute_mapping: {
          keys: { ...canonical, given_name: { name: 'urn:other' } },
        },
      },
    };
    const [plan] = planMappingUpdates([drifted], canonical);
    expect(plan.changedKeys).toEqual(['given_name']);
    expect(plan.after.given_name).toEqual({ name: 'urn:givenname' });
  });

  it('limits the plan to the requested providers', () => {
    const plans = planMappingUpdates([unmapped, staging], canonical, [
      'staging',
    ]);
    expect(plans.map((p) => p.providerId)).toEqual(['staging']);
  });

  it('fails fast on a provider id that is not on the project', () => {
    expect(() => planMappingUpdates([unmapped], canonical, ['nope'])).toThrow(
      'No SSO provider nope on this project',
    );
  });
});

describe('withTempDir', () => {
  it('removes the directory after the callback returns', () => {
    let dir = '';
    const result = withTempDir('sso-test-', (d) => {
      dir = d;
      writeFileSync(path.join(d, 'x.json'), '{}');
      return 'done';
    });
    expect(result).toBe('done');
    expect(dir).not.toBe('');
    expect(existsSync(dir)).toBe(false);
  });

  it('removes the directory when the callback throws', () => {
    let dir = '';
    expect(() =>
      withTempDir('sso-test-', (d) => {
        dir = d;
        writeFileSync(path.join(d, 'x.json'), '{}');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(existsSync(dir)).toBe(false);
  });
});

describe('supabase cli args', () => {
  it('registers a SAML provider with the canonical mapping', () => {
    expect(
      ssoAddArgs(REF, 'customer.com', 'https://idp.example/m.xml', '/m.json'),
    ).toEqual([
      'sso',
      'add',
      '--type',
      'saml',
      '--project-ref',
      REF,
      '--domains',
      'customer.com',
      '--metadata-url',
      'https://idp.example/m.xml',
      '--attribute-mapping-file',
      '/m.json',
      '-o',
      'json',
    ]);
  });

  it('lists providers as json', () => {
    expect(ssoListArgs(REF)).toEqual([
      'sso',
      'list',
      '--project-ref',
      REF,
      '-o',
      'json',
    ]);
  });

  it('updates one provider from a mapping file', () => {
    expect(ssoUpdateArgs(REF, 'p1', '/tmp/p1.json')).toEqual([
      'sso',
      'update',
      'p1',
      '--project-ref',
      REF,
      '--attribute-mapping-file',
      '/tmp/p1.json',
      '-o',
      'json',
    ]);
  });
});
