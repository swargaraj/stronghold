const CACHE_TTL = 10 * 60 * 1000;

type CacheEntry<T> = {
  value: T;
  expiry: number;
};

export function cachedFetcher<T>(
  fetchFn: () => Promise<T>,
  ttl: number = CACHE_TTL,
): () => Promise<T> {
  let cache: CacheEntry<T> | null = null;

  return async function getCached(): Promise<T> {
    const now = Date.now();

    if (cache && now < cache.expiry) {
      return cache.value;
    }

    const value = await fetchFn();

    cache = {
      value,
      expiry: now + ttl,
    };

    return value;
  };
}
