interface RedisConfig {
  url: string | null;
  options?: any;
}

const redisDefaultOptions = {
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000,
};

const env = process.env.ENV === 'staging' ? 'stg' : process.env.ENV;
let cachedRedisUrl: string | null = null;
let cachedRedisOptions: any = redisDefaultOptions;
if (env !== 'local') {
  cachedRedisOptions.tls = {
    rejectUnauthorized: false,
  };
}

export async function getRedisConfig(): Promise<RedisConfig> {
  if (cachedRedisUrl) {
    return { url: cachedRedisUrl, options: cachedRedisOptions };
  }

  let url: string | null = null;

  url = process.env.ELASTICACHE_REDIS_URL || null;

  if (!url) {
    throw new Error(
      'Redis URL not found in AWS Parameter Store (postsig/env/redisUrl) or environment variable (ELASTICACHE_REDIS_URL)',
    );
  }

  cachedRedisUrl = url;
  return { url: url || null, options: cachedRedisOptions };
}
