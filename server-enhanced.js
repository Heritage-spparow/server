const { configDotenv } = require('dotenv');
const cluster = require('cluster');
const os = require('os');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Load environment variables first
configDotenv();

// Import enhanced modules
const { initializeDatabases, closeDatabases } = require('./connection/databases');
const HealthService = require('./services/HealthService');

// Setup logging
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
      filename: path.join(logDir, 'enhanced-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info'),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports
});

/**
 * Enhanced E-commerce Server
 * Implements scalable architecture with service layer, API gateway, and enhanced monitoring
 */
class EnhancedServer {
  constructor() {
    this.app = null;
    this.server = null;
    this.healthService = null;
    this.isShuttingDown = false;
  }

  /**
   * Initialize the enhanced server
   */
  async initialize() {
    try {
      logger.info('🚀 Starting Enhanced E-commerce Server...');

      // Initialize databases first
      await this.initializeDatabases();

      // Initialize health monitoring
      await this.initializeHealthService();

      // Create Express app with enhanced architecture
      await this.createApp();

      // Setup error handling and graceful shutdown
      this.setupErrorHandling();

      logger.info('✅ Enhanced server initialization complete');

    } catch (error) {
      logger.error('❌ Failed to initialize enhanced server:', error);
      process.exit(1);
    }
  }

  /**
   * Initialize database connections
   */
  async initializeDatabases() {
    logger.info('📊 Initializing database connections...');

    try {
      await initializeDatabases({
        mainUri: process.env.MAIN_MONGO_URI,
        adminUri: process.env.ADMIN_MONGO_URI
      });

      logger.info('✅ Database connections established');
    } catch (error) {
      logger.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize health service
   */
  async initializeHealthService() {
    logger.info('🏥 Initializing health monitoring...');

    try {
      this.healthService = new HealthService();
      
      // Start periodic health checks
      this.healthService.startPeriodicHealthChecks(60000); // Every minute

      logger.info('✅ Health monitoring initialized');
    } catch (error) {
      logger.error('❌ Health service initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create Express application with enhanced architecture
   */
  async createApp() {
    logger.info('🏗️  Creating Express application...');

    const express = require('express');
    const cors = require('cors');
    const helmet = require('helmet');
    const compression = require('compression');
    const cookieParser = require('cookie-parser');
    const mongoSanitize = require('express-mongo-sanitize');
    const xss = require('xss-clean');
    const hpp = require('hpp');
    const rateLimit = require('express-rate-limit');

    this.app = express();

    // Trust proxy
    this.app.set('trust proxy', 1);

    // Security middleware
    this.app.use(helmet({
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "http://localhost:*"],
        },
      },
    }));

    // CORS configuration
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      process.env.CLIENT_URL,
      process.env.ADMIN_URL,
      process.env.FRONTEND_URL
    ].filter(Boolean);

    this.app.use(cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn('CORS blocked origin:', origin);
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(cookieParser());
    this.app.use(compression());

    // Security middleware
    this.app.use(mongoSanitize({ allowDots: false, replaceWith: '_' }));
    this.app.use(xss());
    this.app.use(hpp({
      whitelist: ['sort', 'fields', 'page', 'limit', 'category', 'price']
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 1000,
      standardHeaders: true,
      legacyHeaders: false,
      message: 'Too many requests from this IP',
      skip: (req) => req.method === 'OPTIONS'
    });
    this.app.use('/api', limiter);

    // Request logging
    this.app.use((req, res, next) => {
      logger.info('Request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });

    // Setup routes
    await this.setupRoutes();

    // Error handling
    this.setupAppErrorHandling();

    logger.info('✅ Express application created');
  }

  /**
   * Setup application routes
   */
  async setupRoutes() {
    logger.info('🛣️  Setting up routes...');

    // Enhanced health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.healthService.runHealthChecks();
        res.status(health.status === 'healthy' ? 200 : 503).json(health);
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Health summary endpoint
    this.app.get('/health/summary', async (req, res) => {
      try {
        const summary = await this.healthService.getHealthSummary();
        res.json(summary);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Service-specific health checks
    this.app.get('/health/:service', async (req, res) => {
      try {
        const result = await this.healthService.getServiceHealth(req.params.service);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // API documentation endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'Heritage Sparrow Enhanced API',
        version: process.env.APP_VERSION || '2.0.0',
        environment: process.env.NODE_ENV || 'development',
        architecture: 'Enhanced Monolith with Service Layer',
        features: [
          'Separated Database Connections',
          'Enhanced Role-Based Access Control',
          'Service Layer Architecture',
          'Comprehensive Health Monitoring',
          'API Gateway Pattern Ready'
        ],
        endpoints: {
          health: {
            overview: '/health',
            summary: '/health/summary',
            specific: '/health/:service'
          },
          api: {
            auth: '/api/auth',
            products: '/api/products',
            cart: '/api/cart',
            orders: '/api/orders',
            admin: '/api/admin'
          }
        },
        database: {
          main: process.env.MAIN_MONGO_URI ? 'Connected' : 'Not configured',
          admin: process.env.ADMIN_MONGO_URI ? 'Connected' : 'Using main database'
        }
      });
    });

    // Import and setup existing routes with enhanced middleware
    const { protect: enhancedProtect, requirePermission } = require('./middleware/authEnhanced');

    // Auth routes (enhanced)
    const authRoutes = require('./Routes/Auth');
    this.app.use('/api/auth', authRoutes);

    // Products routes  
    const productRoutes = require('./Routes/ProductsEnhanced');
    this.app.use('/api/products', productRoutes);

    // Cart routes (requires authentication)
    const cartRoutes = require('./Routes/Cart');
    this.app.use('/api/cart', enhancedProtect, cartRoutes);

    // Order routes (requires authentication)
    const orderRoutes = require('./Routes/Order');
    this.app.use('/api/orders', enhancedProtect, orderRoutes);

    // Admin routes (requires admin permissions)
    const adminRoutes = require('./Routes/Admin');
    this.app.use('/api/admin', enhancedProtect, requirePermission(['admin:read', 'admin:write']), adminRoutes);

    // Default route
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Heritage Sparrow Enhanced E-commerce API',
        version: process.env.APP_VERSION || '2.0.0',
        status: 'operational',
        docs: '/api',
        health: '/health'
      });
    });

    logger.info('✅ Routes configured');
  }

  /**
   * Setup application error handling
   */
  setupAppErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Resource not found',
        path: req.path,
        method: req.method
      });
    });

    // Global error handler
    this.app.use((err, req, res, next) => {
      logger.error('Application error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip
      });

      if (!res.headersSent) {
        res.status(err.status || 500).json({
          success: false,
          error: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : err.message,
          ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
        });
      }
    });
  }

  /**
   * Setup process error handling and graceful shutdown
   */
  setupErrorHandling() {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      this.gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown('UNHANDLED_REJECTION');
    });

    // Handle termination signals
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
  }

  /**
   * Start the server
   */
  async start() {
    const PORT = process.env.PORT || 3000;

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(PORT, (error) => {
        if (error) {
          logger.error('❌ Failed to start server:', error);
          reject(error);
        } else {
          logger.info(`🚀 Enhanced server listening on http://localhost:${PORT}`);
          logger.info(`📊 Health checks available at http://localhost:${PORT}/health`);
          logger.info(`📚 API documentation at http://localhost:${PORT}/api`);
          resolve(this.server);
        }
      });
    });
  }

  /**
   * Graceful shutdown
   */
  async gracefulShutdown(signal) {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    logger.warn(`🛑 Received ${signal}. Starting graceful shutdown...`);

    const shutdownTimeout = setTimeout(() => {
      logger.error('❌ Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 30000); // 30 seconds timeout

    try {
      // Stop accepting new requests
      if (this.server) {
        await new Promise((resolve) => this.server.close(resolve));
        logger.info('✅ HTTP server closed');
      }

      // Stop health service
      if (this.healthService) {
        await this.healthService.cleanup();
        logger.info('✅ Health service stopped');
      }

      // Close database connections
      await closeDatabases();
      logger.info('✅ Database connections closed');

      clearTimeout(shutdownTimeout);
      logger.info('✅ Graceful shutdown completed');
      process.exit(0);

    } catch (error) {
      logger.error('❌ Error during graceful shutdown:', error);
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  }
}

/**
 * Main server startup logic
 */
async function startServer() {
  // Validate required environment variables
  const requiredEnvVars = ['JWT_SECRET'];
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingEnvVars.length > 0) {
    logger.error('❌ Missing required environment variables:', missingEnvVars);
    process.exit(1);
  }

  // Use clustering in production
  const useCluster = process.env.NODE_ENV === 'production' && process.env.USE_CLUSTER === 'true';
  const numCPUs = os.cpus().length;

  if (useCluster && cluster.isMaster) {
    logger.info(`🏭 Master process ${process.pid} starting ${numCPUs} workers`);

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    // Handle worker exit
    cluster.on('exit', (worker, code, signal) => {
      logger.warn(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
      setTimeout(() => cluster.fork(), 1000);
    });

    // Handle master process termination
    process.on('SIGTERM', () => {
      logger.info('Master received SIGTERM, shutting down workers...');
      for (const id in cluster.workers) {
        cluster.workers[id].kill();
      }
    });

  } else {
    // Start worker process
    const server = new EnhancedServer();
    
    try {
      await server.initialize();
      await server.start();
      
      const processId = cluster.worker ? `Worker ${cluster.worker.process.pid}` : `Process ${process.pid}`;
      logger.info(`✅ ${processId} started successfully`);
      
    } catch (error) {
      logger.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start the server
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('❌ Server startup failed:', error);
    process.exit(1);
  });
}

module.exports = { EnhancedServer, startServer };