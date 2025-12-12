const Queue = require('bull');
const Redis = require('ioredis');
const redisUrl = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const redisOptions = {
    port: parseInt(redisUrl.port, 10),
    host: redisUrl.hostname,
    password: redisUrl.password,
    username: redisUrl.username === 'default' ? null : redisUrl.username,
    maxRetriesPerRequest: 10,
    enableOfflineQueue: true,
};
const emailQueue = new Queue('email', { redis: redisOptions },{
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: true,
    removeOnFail: false
  }
});

module.exports = { emailQueue };
