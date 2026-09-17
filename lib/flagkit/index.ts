import { cache } from 'react';
import { createFeatureClient } from '@postsig/flagkit-sdk';
import { createClient } from '@/utils/supabase/service_server';
import { createSupabaseAdapter } from '@postsig/flagkit-supabase';
import { Environment, EvaluationContext } from '@postsig/flagkit-types';

export function normalizeEnv(raw: string | undefined): Environment {
  switch (raw) {
    case 'local':
    case 'dev':
    case 'development':
      return 'development';
    case 'staging':
      return 'staging';
    case 'prod':
    case 'production':
      return 'production';
    default:
      return 'development';
  }
}

export async function createFlagClient() {
  const client = createFeatureClient({
    environment: normalizeEnv(process.env.ENV),
    adapter: createSupabaseAdapter(createClient()),
  });
  return client;
}

type ContextEntries = readonly (readonly [string, string | number | boolean])[];

/**
 * React.cache keys on argument identity, and EvaluationContext is an open
 * record rebuilt at every call site, so the context is flattened into one
 * canonical string covering every field: callers passing the same fields share
 * a single evaluation, callers passing different ones never collide.
 */
function serializeContext(context: EvaluationContext): string {
  const entries: ContextEntries = Object.keys(context)
    .sort()
    .map((key) => [key, context[key]] as const);
  return JSON.stringify(entries);
}

const evaluateFeature = cache(
  async (featureKey: string, serializedContext: string): Promise<boolean> => {
    const flagClient = await createFlagClient();
    return flagClient.isEnabled(
      featureKey,
      Object.fromEntries(JSON.parse(serializedContext) as ContextEntries),
    );
  },
);

export async function isFeatureEnabled(
  featureKey: string,
  context: EvaluationContext,
): Promise<boolean> {
  return evaluateFeature(featureKey, serializeContext(context));
}
