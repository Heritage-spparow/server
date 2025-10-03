const { configDotenv } = require('dotenv');
const express = require('express');
const cors = require('cors');
const cluster = require('cluster');
const os = require('os');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const Redis = require('ioredis');
const RedisStore = require('rate-limit-redis');
const fs = require("fs");
const path = require("path");

// Route imports
const authRoutes = require('./Routes/Auth');
const productRoutes = require('./Routes/ProductsEnhanced');
const cartRoutes = require('./Routes/Cart');
const orderRoutes = require('./Routes/Order');
const db = require('./connection/db');
const adminRoutes = require('./Routes/Admin');

console.log('1 Starting server...');

// ======= FIXED logDir =======
let logDir;
if (process.env.NODE_ENV === 'production') {
  // Writable directory for serverless or deployment
  logDir = path.join("/tmp", "logs");
} else {
  logDir = path.join(__dirname, "logs");
}

// Ensure logDir exists (only if writable)
try {
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
} catch (err) {
  console.warn(`Cannot create log directory ${logDir}: ${err.message}`);
}

// ======= Logger setup =======
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logDir, "app.log") }),
    new DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

configDotenv();
logger.info('Environment variables loaded');

console.log('2 Starting server...');

if (!process.env.CLIENT_URL) {
  logger.error('CLIENT_URL environment variable is not set. Please ensure the .env file exists and contains CLIENT_URL.');
  process.exit(1);
}
if (!process.env.MONGO_URI) {
  logger.error('MONGO_URI environment variable is not set. Please ensure the .env file contains MONGO_URI.');
  process.exit(1);
}

// Disable clustering for development
const useCluster = process.env.NODE_ENV === 'production' && process.env.USE_CLUSTER === 'true';
const numCPUs = os.cpus().length;

if (useCluster && cluster.isMaster) {
  logger.info(`Master ${process.pid} is running`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died with code ${code}, signal ${signal}. Restarting...`);
    setTimeout(() => cluster.fork(), 1000);
  });
} else {
  const app = express();

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Trust proxy for production deployment
  app.set('trust proxy', 1);

  // CORS configuration
  const baseOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://[::1]:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5174',
    'http://[::1]:5173'
  ];
  let allowedOrigins = new Set(baseOrigins);

  if (process.env.CLIENT_URL) {
    allowedOrigins.add(process.env.CLIENT_URL);
  }

  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',').forEach(origin => allowedOrigins.add(origin.trim()));
  }

  allowedOrigins = Array.from(allowedOrigins);
  logger.info('Allowed Origins:', allowedOrigins);

  console.log('3 Starting server...');
  app.use(cors({
    origin: function (origin, callback) {
      logger.debug('CORS Request from origin:', origin);
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
      logger.error('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Cache-Control',
      'X-CSRF-Token'
    ],
    exposedHeaders: ['Content-Length', 'X-Requested-With'],
    maxAge: 86400,
    optionsSuccessStatus: 200,
    preflightContinue: false,
  }));

  console.log('4 Starting server...');
  // Cookie parser
  app.use(cookieParser());

  // Compression middleware
  app.use(compression());

  // Security middleware
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "http://localhost:3000", "http://localhost:5173", "http://localhost:5174/"],
      },
    },
  }));

  // Data sanitization
  app.use(mongoSanitize({ allowDots: false, replaceWith: '_' }));
  app.use(xss());

  // Prevent parameter pollution
  app.use(hpp({ whitelist: ['sort', 'fields', 'page', 'limit', 'category', 'price'] }));

  // Redis client
  const redisClient = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    retryStrategy(times) {
      return Math.min(times * 100, 2000);
    },
    maxRetriesPerRequest: 5,
    enableReadyCheck: true,
  });

  redisClient.on('error', (err) => logger.error('Redis client error', { error: err.message }));
  redisClient.on('connect', () => logger.info('Redis client connecting...'));
  redisClient.on('ready', () => logger.info('Redis client ready'));
  redisClient.on('end', () => logger.warn('Redis client connection closed'));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.',
    store: new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
    }),
    skip: (req) => req.method === 'OPTIONS',
  });
  app.use('/api', limiter);

  // Speed limiter
  const speedLimiter = slowDown({
    windowMs: 15 * 60 * 1000,
    delayAfter: 50,
    delayMs: () => 500,
    skip: (req) => req.method === 'OPTIONS'
  });
  app.use('/api', speedLimiter);

  // Database connection
  async function initializeDatabase() {
    try {
      if (typeof db.connect !== 'function') throw new Error('db.connect is not a function.');
      await db.connect(process.env.MONGO_URI);
      logger.info('MongoDB connection established');
    } catch (error) {
      logger.error('MongoDB connection failed:', error);
      process.exit(1);
    }
  }

  initializeDatabase();

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/products-enhanced', productRoutes);
  app.use('/api/admin', adminRoutes);

  // API Documentation endpoint
  app.get('/api', (req, res) => {
    res.json({
      message: 'Heritage spparow API v1.0',
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    });
  });

  // Health check
  app.get('/health', (req, res) => res.status(200).json({ status: 'OK', uptime: process.uptime() }));

  // Test endpoint
  app.get('/api/test', (req, res) => res.status(200).json({ message: 'CORS test successful', origin: req.headers.origin }));

  // Default route
  app.get('/', (req, res) => res.send('This is the server of the app'));

  // Error handling
  app.use((err, req, res, next) => {
    logger.error(`${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
    logger.error('Full stack trace:', err.stack);
    console.error('Full error details:', err);
    res.status(err.status || 500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message
    });
  });

  // 404 handler
  app.use((req, res) => res.status(404).json({ error: 'Not Found', message: 'The requested resource was not found' }));

  const PORT = process.env.PORT || 3000;

  // Start server
  const server = app.listen(PORT, () => logger.info(`Worker ${process.pid} started on http://localhost:${PORT}`));

  // Graceful shutdown
  const shutdown = async (signal) => {
    try {
      logger.warn(`Received ${signal}. Starting graceful shutdown...`);

      await new Promise((resolve) => server.close(resolve));
      logger.info('HTTP server closed');

      try {
        if (db.connection && db.connection.readyState !== 0) {
          await db.connection.close(false);
          logger.info('MongoDB connection closed');
        }
      } catch (e) { logger.error('Error closing MongoDB connection', e); }

      try {
        if (typeof redisClient?.quit === 'function') {
          await redisClient.quit();
          logger.info('Redis client closed');
        }
      } catch (e) { logger.error('Error closing Redis client', e); }

      process.exit(0);
    } catch (err) {
      logger.error('Error during graceful shutdown', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
