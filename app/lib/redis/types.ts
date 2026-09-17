import { UserMetadata } from '@/constants/types';

export interface CacheOptions {
  ttl?: number;
  userScoped?: boolean;
  organizationScoped?: boolean;
}

export interface RedisServiceInterface {
  get<T>(key: string, userMetadata?: UserMetadata): Promise<T | null>;
  set<T>(
    key: string,
    value: T,
    userMetadata?: UserMetadata,
    ttl?: number,
  ): Promise<boolean>;
  del(
    key: string,
    userMetadata?: Pick<UserMetadata, 'organizationId' | 'userId'>,
  ): Promise<boolean>;
  exists(key: string, userMetadata?: UserMetadata): Promise<boolean>;
  mget<T>(keys: string[], userMetadata?: UserMetadata): Promise<(T | null)[]>;
  mset(
    pairs: Array<{ key: string; value: any }>,
    userMetadata?: UserMetadata,
    ttl?: number,
  ): Promise<boolean>;
  clearUserCache(userMetadata: UserMetadata): Promise<boolean>;
  clearOrganizationCache(
    userMetadata: Pick<UserMetadata, 'organizationId'>,
  ): Promise<boolean>;
  getHealth(): Promise<{ connected: boolean; [key: string]: any }>;
}

export interface ContractCache {
  id: number;
  data: any;
  lastModified: string;
  userId: string;
}

export interface VendorCache {
  id: number;
  name: string;
  products: any[];
  userId: string;
  organizationId: string;
}

export interface SessionCache {
  userId: string;
  sessionData: any;
  expiresAt: string;
}

export interface SearchCache {
  query: string;
  results: any[];
  facets: any;
  userId: string;
  timestamp: string;
}
