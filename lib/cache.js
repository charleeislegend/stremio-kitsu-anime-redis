import Redis from 'ioredis';

const GLOBAL_KEY_PREFIX = 'stremio-kitsu';
const META_KEY_PREFIX = `${GLOBAL_KEY_PREFIX}|meta`;
const CATALOG_KEY_PREFIX = `${GLOBAL_KEY_PREFIX}|catalog`;
const IMAGES_KEY_PREFIX = `${GLOBAL_KEY_PREFIX}|images`;
const ID_MAPPING_KEY_PREFIX = `${GLOBAL_KEY_PREFIX}|id_mapping`;

const META_TTL = parseInt(process.env.META_TTL || `${24 * 60 * 60}`); // 1 day
const CATALOG_TTL = parseInt(process.env.CATALOG_TTL || `${24 * 60 * 60}`); // 1 day
const IMAGES_TTL = 14 * 24 * 60 * 60; // 14 days
const IMAGES_NON_EN_TTL = 4 * 24 * 60 * 60; // 4 days
const IMAGES_NULL_TTL = 2 * 24 * 60 * 60; // 2 days

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export class CacheWrapper {
  async wrap(key, fn, ttl) {
    const cached = await redis.get(key);
    if (cached) {
      try {
        return JSON.parse(cached);  // Cache hit, return the cached data
      } catch (err) {
        console.error(`Failed to parse cache for key: ${key}`, err);  // Handle parse errors
      }
    }

    const result = await fn();  // Execute the function if cache miss
    await redis.set(key, JSON.stringify(result), 'EX', ttl);  // Store the result in Redis
    return result;
  }
}

const cache = new CacheWrapper();

function cacheWrap(key, method, options) {
  return cache.wrap(key, method, options.ttl);
}

function cacheWrapCatalog(id, method) {
  return cacheWrap(`${CATALOG_KEY_PREFIX}:${id}`, method, { ttl: CATALOG_TTL });
}

function cacheWrapMeta(id, method) {
  return cacheWrap(`${META_KEY_PREFIX}:${id}`, method, { ttl: META_TTL });
}

function cacheWrapImages(id, method) {
  return cacheWrap(`${IMAGES_KEY_PREFIX}:${id}`, async () => {
    const images = await method();  // First, call the method to get the image data
    const ttl = images.logoLang === 'en' ? IMAGES_TTL
                : images.logoLang || images.logo ? IMAGES_NON_EN_TTL
                : IMAGES_NULL_TTL;
    return images;  // Return the actual image data
  }, { ttl: 0 });  // TTL will be calculated inside the method itself
}

function cacheWrapIdMapping(id, method) {
  return cacheWrap(`${ID_MAPPING_KEY_PREFIX}:${id}`, method, { ttl: IMAGES_TTL });
}

export {
  cacheWrapCatalog,
  cacheWrapMeta,
  cacheWrapImages,
  cacheWrapIdMapping,
  cache,
};
export default redis;
