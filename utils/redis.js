const Redis = require("ioredis");

let redis = null;

function getRedis() {
  if (redis) return redis;

  const isTLS = process.env.REDIS_URL?.startsWith("rediss://");

  redis = new Redis(process.env.REDIS_URL, {
    ...(isTLS && { tls: {} }),
    lazyConnect: true,
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  redis.on("connect", () => {
    console.log("✅ Redis connected");
  });

  redis.on("error", (err) => {
    console.warn("⚠️ Redis error:", err.message);
  });

  redis.connect().catch(() => {
    console.warn("⚠️ Redis unavailable, caching disabled");
    redis = null;
  });

  return redis;
}

module.exports = getRedis;
