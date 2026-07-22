import { KernelConfigurationError } from './kernel-config.errors';

export type CacheNamespaceInput = Readonly<{
  application: string;
  stage: string;
  deploymentId: string;
  schemaVersion: number;
  tenantId?: string;
  locale?: string;
}>;

function component(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/u.test(normalized)) {
    throw new KernelConfigurationError(
      'KERNEL_CACHE_NAMESPACE_MISSING',
      `${label} nem használható cache namespace komponensként.`,
    );
  }
  return normalized;
}

export function createCacheNamespace(input: CacheNamespaceInput): string {
  if (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1) {
    throw new KernelConfigurationError(
      'KERNEL_CACHE_NAMESPACE_MISSING',
      'A cache schema version pozitív egész legyen.',
    );
  }
  return [
    component(input.application, 'application'),
    component(input.stage, 'stage'),
    `v${input.schemaVersion}`,
    component(input.deploymentId, 'deploymentId'),
    ...(input.tenantId ? ['tenant', component(input.tenantId, 'tenantId')] : []),
    ...(input.locale ? ['locale', component(input.locale, 'locale')] : []),
  ].join(':');
}

export type SharedCacheWriteOptions = Readonly<{
  ttlMs?: number;
  tags?: readonly string[];
}>;

export interface SharedCachePort<T> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T, options?: SharedCacheWriteOptions): Promise<void>;
  delete(key: string): Promise<void>;
  invalidateTag(tag: string): Promise<void>;
}

export type InMemorySharedCacheRecord<T> = { value: T; expiresAt?: number; tags: Set<string> };
export type InMemorySharedCacheStore<T> = Map<string, InMemorySharedCacheRecord<T>>;

export function createInMemorySharedCacheStore<T>(): InMemorySharedCacheStore<T> {
  return new Map<string, InMemorySharedCacheRecord<T>>();
}

export function createInMemorySharedCache<T>(
  records: InMemorySharedCacheStore<T> = createInMemorySharedCacheStore<T>(),
): SharedCachePort<T> {
  return Object.freeze({
    async get(key: string): Promise<T | null> {
      const record = records.get(key);
      if (!record) return null;
      if (record.expiresAt !== undefined && record.expiresAt <= Date.now()) {
        records.delete(key);
        return null;
      }
      return record.value;
    },
    async set(key: string, value: T, options: SharedCacheWriteOptions = {}): Promise<void> {
      if (options.ttlMs !== undefined && (!Number.isSafeInteger(options.ttlMs) || options.ttlMs <= 0)) {
        throw new KernelConfigurationError(
          'KERNEL_SHARED_CACHE_UNSAFE',
          'A shared-cache TTL pozitív safe integer legyen.',
        );
      }
      const tags = new Set((options.tags ?? []).map((tag) => component(tag, 'cache tag')));
      records.set(key, {
        value,
        ...(options.ttlMs === undefined ? {} : { expiresAt: Date.now() + options.ttlMs }),
        tags,
      });
    },
    async delete(key: string): Promise<void> {
      records.delete(key);
    },
    async invalidateTag(tag: string): Promise<void> {
      for (const [key, record] of records) {
        if (record.tags.has(tag)) records.delete(key);
      }
    },
  });
}
