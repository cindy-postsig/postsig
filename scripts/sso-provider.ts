/**
 * Manage Supabase SAML SSO providers with the standard Entra attribute mapping
 * (supabase/sso/entra-attribute-mapping.json). Requires `supabase login`.
 *
 * Onboard a customer (mapping applied at creation):
 *
 *   npm run sso:add -- --project-ref <ref> \
 *     --domain customer.com \
 *     --metadata-url "https://login.microsoftonline.com/<tenant>/federationmetadata/2007-06/federationmetadata.xml?appid=<appid>"
 *
 * Sync the mapping into existing providers (all, or only --provider ids).
 * Existing keys the mapping file does not name are preserved:
 *
 *   npm run sso:mapping -- --project-ref <ref> [--provider <id>]... [--dry-run]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  parseArgs,
  planMappingUpdates,
  ssoAddArgs,
  ssoListArgs,
  ssoUpdateArgs,
  withTempDir,
  type MappingKeys,
  type SsoProvider,
} from './lib/sso-provider';

const MAPPING_FILE = path.resolve(
  __dirname,
  '../supabase/sso/entra-attribute-mapping.json',
);

function supabase(args: string[]): string {
  return execFileSync('supabase', args, {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'inherit'],
  });
}

function canonicalKeys(): MappingKeys {
  const parsed: unknown = JSON.parse(readFileSync(MAPPING_FILE, 'utf8'));
  const keys = (parsed as { keys?: unknown }).keys;
  if (typeof keys !== 'object' || keys === null) {
    throw new Error(`${MAPPING_FILE} must be { "keys": { ... } }`);
  }
  return keys as MappingKeys;
}

function add(projectRef: string, domain: string, metadataUrl: string): void {
  console.log(
    supabase(ssoAddArgs(projectRef, domain, metadataUrl, MAPPING_FILE)),
  );
}

function syncMapping(
  projectRef: string,
  providerIds: string[],
  dryRun: boolean,
): void {
  const listed = JSON.parse(supabase(ssoListArgs(projectRef))) as {
    providers?: SsoProvider[];
  };
  const plans = planMappingUpdates(
    listed.providers ?? [],
    canonicalKeys(),
    providerIds,
  );
  if (plans.length === 0) {
    console.log('No SSO providers on this project.');
    return;
  }

  for (const plan of plans) {
    const label = `${plan.providerId} (${plan.domains.join(', ')})`;
    if (plan.changedKeys.length === 0) {
      console.log(`= ${label}: already up to date`);
      continue;
    }
    console.log(`${dryRun ? '~' : '+'} ${label}`);
    for (const key of plan.changedKeys) {
      const before = JSON.stringify(plan.before[key]) ?? '(unset)';
      console.log(`    ${key}: ${before} → ${JSON.stringify(plan.after[key])}`);
    }
  }

  const pending = plans.filter((plan) => plan.changedKeys.length > 0);
  if (dryRun) {
    console.log('Dry run — nothing written.');
    return;
  }
  if (pending.length === 0) return;

  withTempDir('sso-mapping-', (dir) => {
    for (const plan of pending) {
      const file = path.join(dir, `${plan.providerId}.json`);
      writeFileSync(file, JSON.stringify({ keys: plan.after }, null, 2));
      supabase(ssoUpdateArgs(projectRef, plan.providerId, file));
      console.log(`✓ updated ${plan.providerId}`);
    }
  });
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'add') {
    add(args.projectRef, args.domain, args.metadataUrl);
  } else {
    syncMapping(args.projectRef, args.providerIds, args.dryRun);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
