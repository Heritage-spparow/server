const Redis = require("ioredis");

let globalRedis = global.__redis;

if (!globalRedis) {
  globalRedis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  global.__redis = globalRedis;

  globalRedis.on("ready", () => {
    console.log("✅ Redis connected (singleton)");
  });

  globalRedis.on("error", (err) => {
    console.warn("⚠️ Redis error:", err.message);
  });
}

module.exports = () => global.__redis;
