const Redis = require("ioredis");

let client = null;
let isReady = false;

function getRedis() {
  if (client && isReady) return client;

  if (!client) {
    const isTLS = process.env.REDIS_URL?.startsWith("rediss://");

    client = new Redis(process.env.REDIS_URL, {
      ...(isTLS && { tls: {} }),
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    client.on("connect", () => {
      console.log("🟡 Redis connecting...");
    });

    client.on("ready", () => {
      isReady = true;
      console.log("✅ Redis ready");
    });

    client.on("error", (err) => {
      console.warn("⚠️ Redis error:", err.message);
      isReady = false;
    });

    client.on("end", () => {
      console.warn("⚠️ Redis connection closed");
      isReady = false;
    });

    client.connect().catch(() => {
      console.warn("⚠️ Redis unavailable, caching disabled");
      client = null;
      isReady = false;
    });
  }

  // 🔴 KEY LINE
  if (!isReady) return null;

  return client;
}

module.exports = getRedis;
