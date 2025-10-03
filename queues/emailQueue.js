const Queue = require('bull');

// Create and export a Bull queue for emails
// Uses REDIS_URL if provided, otherwise defaults to local Redis
const emailQueue = new Queue('email', process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: true,
    removeOnFail: false
  }
});

module.exports = { emailQueue };
