const { configDotenv } = require('dotenv');
configDotenv();
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
const RedisStore = require('rate-limit-redis').default;
const fs = require("fs");
const path = require("path");
// Route imports - Keep these synchronous requires for now
const authRoutes = require('./Routes/Auth');
const productRoutes = require('./Routes/ProductsEnhanced');
const cartRoutes = require('./Routes/Cart');
const orderRoutes = require('./Routes/Order');
const adminRoutes = require('./Routes/Admin');
const db = require('./connection/db');
const passport = require('./config/passport');




console.log('1 Starting server...');
const logDir = path.join(__dirname, "logs");
const transports = [
  new winston.transports.Console({ 
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple() 
    )
  })
];
 

if (fs.existsSync(logDir)) {
  transports.push(
    new winston.transports.File({ filename: path.join(logDir, "app.log") }),
    new DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d' 
    })
  );
}

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports
});


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
// Add this check
if (!process.env.API_BASE_URL) {
  logger.error('API_BASE_URL environment variable is not set. This is required for Google OAuth callback.');
  process.exit(1);
}


// Disable clustering for development
const useCluster = process.env.NODE_ENV === 'production' && process.env.USE_CLUSTER === 'true';
const numCPUs = os.cpus().length;

if (useCluster && cluster.isMaster) {
  logger.info(`Master ${process.pid} is running`);

  // Fork workers for each CPU core
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died with code ${code}, signal ${signal}. Restarting...`);
    setTimeout(() => cluster.fork(), 1000);
  });
} else {
  const app = express();
  app.use((req, res, next) => {
  if (req.url.includes('/auth/google')) {
    console.log('🟢 HIT:', req.method, req.url);
  }
  next();
});
  // Initialize Passport.js
  app.use(passport.initialize());
  let server;


  // Body parsing middleware
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));



  // Trust proxy for production deployment
  app.set('trust proxy', 1);

  // CORS configuration - MUST BE FIRST
  const baseOrigins = ['http://localhost:5173', 'http://localhost:3000', 'http://[::1]:3000', 'http://127.0.0.1:3000', 'http://localhost:5174', 'http://[::1]:5173',
    'https://heritage-spparow-client-git-main-ayushdev-a1s-projects.vercel.app', 'https://heritage-spparow-client.vercel.app'];
  let allowedOrigins = new Set(baseOrigins);

  if (process.env.CLIENT_URL) {
    allowedOrigins.add(process.env.CLIENT_URL);
  }

  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',').forEach(origin => allowedOrigins.add(origin.trim()));
  }
  allowedOrigins = Array.from(allowedOrigins);

  // Log CORS configuration for debugging
  logger.info('Allowed Origins:', allowedOrigins);

  console.log('3 Starting server...');
  app.use(cors({
    origin: function (origin, callback) {
      logger.debug('CORS Request from origin:', origin);
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        logger.debug('Allowing request with no origin');
        return callback(null, true);
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
        logger.debug('Origin allowed:', origin);
        callback(null, true);
      } else {
        logger.error('Blocked by CORS:', origin);
        callback(new Error('Not allowed by CORS'));
      }
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
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 200,
    preflightContinue: false,
  }));
  console.log('4 Starting server...');
  // Cookie parser
  app.use(cookieParser());



  // Compression middleware
  app.use(compression());

  // Security middleware (after CORS)
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "http://localhost:3000", "http://localhost:5173", "http://localhost:5174/",
          "https://heritage-spparow-client.vercel.app"],
      },
    },
  }));

  // Data sanitization against NoSQL query injection
  app.use(mongoSanitize({ allowDots: false, replaceWith: '_' }));

  // Data sanitization against XSS
  app.use(xss());

  // Prevent parameter pollution
  app.use(hpp({
    whitelist: ['sort', 'fields', 'page', 'limit', 'category', 'price']
  }));

  // Redis client for shared rate limiting across instances
  const redisClient = new Redis(process.env.REDIS_URL, {
    retryStrategy(times) {
      // Exponential backoff up to 2s
      return Math.min(times * 100, 2000);
    },
    maxRetriesPerRequest: 5,
    enableReadyCheck: true,
  });

  redisClient.on('error', (err) => {
    logger.error('Redis client error', { error: err.message });
  });
  redisClient.on('connect', () => logger.info('Redis client connecting...'));
  redisClient.on('ready', () => logger.info('Redis client ready'));
  redisClient.on('end', () => logger.warn('Redis client connection closed'));

  // Rate limiting (applied after CORS) with Redis store
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
  const skipOAuth = (req) =>
    req.method === 'GET' && req.path.startsWith('/auth/google');

  app.use('/api', (req, res, next) => {
    if (skipOAuth(req)) return next();
    limiter(req, res, next);
  });
  // Speed limiter for repeated requests
  const speedLimiter = slowDown({
    windowMs: 15 * 60 * 1000,
    delayAfter: 50,
    delayMs: () => 500,
    skip: (req) => {

      return req.method === 'OPTIONS';
    }
  });
  app.use('/api', (req, res, next) => {
    if (skipOAuth(req)) return next();
    speedLimiter(req, res, next);
  });

  // Database connection for MongoDB
  async function initializeDatabase() {
    try {
      if (typeof db.connect !== 'function') {
        throw new Error('db.connect is not a function. Check ./connection/db.js implementation.');
      }
      // Added check to potentially prevent re-connecting in serverless environment
      if (db.connection && db.connection.readyState === 1) {
        logger.info('MongoDB connection already established (re-use)');
        return;
      }
      await db.connect(process.env.MONGO_URI);
      logger.info('MongoDB connection established');
    } catch (error) {
      logger.error('MongoDB connection failed:', error);
      throw error; // Re-throw to be caught in startServer
    }
  }

  // Graceful shutdown function
  const shutdown = async (signal) => {
    try {
      logger.warn(`Received ${signal}. Starting graceful shutdown...`);

      if (server) {
        await new Promise((resolve) => server.close(resolve));
        logger.info('HTTP server closed');
      }

      try {
        if (db.connection && db.connection.readyState !== 0) {
          // Setting force to false prevents Mongoose from issuing the close command immediately, 
          // allowing existing operations to complete, which is good practice.
          await db.connection.close(false);
          logger.info('MongoDB connection closed');
        }
      } catch (e) {
        logger.error('Error closing MongoDB connection', e);
      }

      try {
        if (typeof redisClient?.quit === 'function') {
          await redisClient.quit();
          logger.info('Redis client closed');
        }
      } catch (e) {
        logger.error('Error closing Redis client', e);
      }

      process.exit(0);
    } catch (err) {
      logger.error('Error during graceful shutdown', err);
      process.exit(1);
    }
  };


  // New async function to handle initialization and server start
  const startServer = async () => {
    try {

      await initializeDatabase();

      app.use('/api/auth', authRoutes);
      app.use('/api/products', productRoutes);
      app.use('/api/cart', cartRoutes);
      app.use('/api/orders', orderRoutes);
      app.use('/api/products-enhanced', productRoutes);

      // Admin routes
      app.use('/api/admin', adminRoutes);

      // API Documentation endpoint
      app.get('/api', (req, res) => {
        res.json({
          message: 'Heritage spparow API v1.0',
          version: process.env.APP_VERSION || '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          endpoints: {
            auth: '/api/auth',
            products: '/api/products',
            cart: '/api/cart',
            orders: '/api/orders'
          },
          documentation: {
            auth: {
              register: 'POST /api/auth/register',
              login: 'POST /api/auth/login',
              profile: 'GET /api/auth/me',
              updateProfile: 'PUT /api/auth/profile',
              changePassword: 'PUT /api/auth/password'

            },
            products: {
              getAll: 'GET /api/products',
              getById: 'GET /api/products/:id',
              create: 'POST /api/products (Admin)',
              update: 'PUT /api/products/:id (Admin)',
              delete: 'DELETE /api/products/:id (Admin)',
              addReview: 'POST /api/products/:id/reviews',
              featured: 'GET /api/products/featured',
              topRated: 'GET /api/products/top/rated',
              categories: 'GET /api/products/categories'
            },
            cart: {
              get: 'GET /api/cart',
              add: 'POST /api/cart/add',
              update: 'PUT /api/cart/item/:itemId',
              remove: 'DELETE /api/cart/item/:itemId',
              clear: 'DELETE /api/cart/clear',
              count: 'GET /api/cart/count'
            },
            orders: {
              create: 'POST /api/orders',
              getMyOrders: 'GET /api/orders/my',
              getById: 'GET /api/orders/:id',
              updateToPaid: 'PUT /api/orders/:id/pay',
              cancel: 'PUT /api/orders/:id/cancel',
              getAllOrders: 'GET /api/orders (Admin)',
              updateStatus: 'PUT /api/orders/:id/status (Admin)'
            }
          }
        });
      });

      // Health check endpoint
      app.get('/health', (req, res) => {
        res.status(200).json({ status: 'OK', uptime: process.uptime() });
      });

      // CORS test endpoint
      app.get('/api/test', (req, res) => {
        res.status(200).json({
          message: 'CORS test successful',
          origin: req.headers.origin,
          timestamp: new Date().toISOString()
        });
      });

      // Default route
      app.get('/', (req, res) => {
        res.send('This is the server of the app');
      });

      // Error handling middleware
      app.use((err, req, res, next) => {
        logger.error(`${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
        // Log the full stack trace for debugging
        logger.error('Full stack trace:', err.stack);
        console.error('Full error details:', err);
        res.status(err.status || 500).json({
          error: 'Internal Server Error',
          message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message
        });
      });

      // 404 handler
      app.use((req, res) => {
        res.status(404).json({ error: 'Not Found', message: 'The requested resource was not found' });
      });

      const PORT = process.env.PORT || 3000;

      // Start server (listen) only after everything is ready
      server = app.listen(PORT, '0.0.0.0' , () => {
        console.log(PORT)
        logger.info(`Worker ${process.pid} started on http://localhost:${PORT}`);
      });

    } catch (error) {
      logger.error('Failed to start server due to initialization error. Exiting.', error);
      process.exit(1);
    }
  };

  // Execute the start function
  startServer();

  // Attach shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}