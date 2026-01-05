const Redis = require("ioredis");

const isTLS = process.env.REDIS_URL?.startsWith("rediss://");

const redis = new Redis(process.env.REDIS_URL, {
  ...(isTLS && { tls: {} }),
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false, 
});

redis.on("connect", () => {
  console.log("✅ Redis connected", isTLS ? "(TLS)" : "(NON-TLS)");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err.message);
});

module.exports = redis;
