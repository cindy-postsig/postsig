import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export type SsoProviderArgs =
  | { command: 'add'; projectRef: string; domain: string; metadataUrl: string }
  | {
      command: 'mapping';
      projectRef: string;
      providerIds: string[];
      dryRun: boolean;
    };

const USAGE =
  'Usage: sso-provider <add|mapping> --project-ref <ref> [--domain <d> --metadata-url <url>] [--provider <id>]... [--dry-run]';

const VALUE_FLAGS = [
  '--project-ref',
  '--domain',
  '--metadata-url',
  '--provider',
];

export function parseArgs(args: string[]): SsoProviderArgs {
  const [command, ...flags] = args;
  if (command !== 'add' && command !== 'mapping') throw new Error(USAGE);

  let projectRef: string | null = null;
  let domain: string | null = null;
  let metadataUrl: string | null = null;
  const providerIds: string[] = [];
  let dryRun = false;

  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (flag === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (!VALUE_FLAGS.includes(flag)) {
      throw new Error(`Unknown argument: ${flag}\n${USAGE}`);
    }
    const value = flags[++i];
    if (!value || value.startsWith('--')) {
      throw new Error(`${flag} requires a value`);
    }
    if (flag === '--project-ref') projectRef = value;
    else if (flag === '--domain') domain = value;
    else if (flag === '--metadata-url') metadataUrl = value;
    else providerIds.push(value);
  }

  if (!projectRef) throw new Error('--project-ref is required');

  if (command === 'mapping') {
    if (domain || metadataUrl) {
      throw new Error('--domain and --metadata-url only apply to add');
    }
    return { command, projectRef, providerIds, dryRun };
  }

  if (!domain || !metadataUrl) {
    throw new Error('add requires --domain and --metadata-url');
  }
  if (providerIds.length > 0 || dryRun) {
    throw new Error('--provider and --dry-run only apply to mapping');
  }
  return { command, projectRef, domain, metadataUrl };
}

export type MappingKeys = Record<string, unknown>;

export interface SsoProvider {
  id: string;
  domains: { domain: string }[];
  saml?: { attribute_mapping?: { keys?: MappingKeys | null } | null } | null;
}

export interface MappingPlan {
  providerId: string;
  domains: string[];
  before: MappingKeys;
  after: MappingKeys;
  changedKeys: string[];
}

// Merges rather than replaces so provider-specific keys (staging's email
// workaround for a mailbox-less tenant) survive a sync.
export function planMappingUpdates(
  providers: SsoProvider[],
  canonical: MappingKeys,
  onlyIds: string[] = [],
): MappingPlan[] {
  const selected =
    onlyIds.length === 0
      ? providers
      : onlyIds.map((id) => {
          const provider = providers.find((p) => p.id === id);
          if (!provider)
            throw new Error(`No SSO provider ${id} on this project`);
          return provider;
        });

  return selected.map((provider) => {
    const before = provider.saml?.attribute_mapping?.keys ?? {};
    const changedKeys = Object.keys(canonical).filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(canonical[key]),
    );
    return {
      providerId: provider.id,
      domains: provider.domains.map((d) => d.domain),
      before,
      after: { ...before, ...canonical },
      changedKeys,
    };
  });
}

export function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function ssoAddArgs(
  projectRef: string,
  domain: string,
  metadataUrl: string,
  mappingFile: string,
): string[] {
  return [
    'sso',
    'add',
    '--type',
    'saml',
    '--project-ref',
    projectRef,
    '--domains',
    domain,
    '--metadata-url',
    metadataUrl,
    '--attribute-mapping-file',
    mappingFile,
    '-o',
    'json',
  ];
}

export function ssoListArgs(projectRef: string): string[] {
  return ['sso', 'list', '--project-ref', projectRef, '-o', 'json'];
}

export function ssoUpdateArgs(
  projectRef: string,
  providerId: string,
  mappingFile: string,
): string[] {
  return [
    'sso',
    'update',
    providerId,
    '--project-ref',
    projectRef,
    '--attribute-mapping-file',
    mappingFile,
    '-o',
    'json',
  ];
}
