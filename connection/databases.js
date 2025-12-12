const mongoose = require('mongoose');
const winston = require('winston');

// Create separate connection instances
let mainDB = null;
let adminDB = null;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

/**
 * Initialize database connections
 * @param {Object} config - Database configuration
 * @param {string} config.mainUri - Main database URI
 * @param {string} config.adminUri - Admin database URI
 */
async function initializeDatabases(config = {}) {
  const {
    mainUri = process.env.MAIN_MONGO_URI || process.env.MONGO_URI,
    adminUri = process.env.ADMIN_MONGO_URI || process.env.MONGO_URI
  } = config;

  if (!mainUri) {
    throw new Error('MAIN_MONGO_URI or MONGO_URI is required');
  }

  try {
    // Initialize main database connection
    mainDB = mongoose.createConnection(mainUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4 // Use IPv4, skip trying IPv6
    });

    mainDB.on('connected', () => {
      logger.info('Main Database connected successfully');
    });

    mainDB.on('error', (err) => {
      logger.error('Main Database connection error:', err);
    });

    mainDB.on('disconnected', () => {
      logger.warn('Main Database disconnected');
    });

    // Initialize admin database connection (can be same URI for now)
    if (adminUri && adminUri !== mainUri) {
      adminDB = mongoose.createConnection(adminUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4
      });

      adminDB.on('connected', () => {
        logger.info('Admin Database connected successfully');
      });

      adminDB.on('error', (err) => {
        logger.error('Admin Database connection error:', err);
      });

      adminDB.on('disconnected', () => {
        logger.warn('Admin Database disconnected');
      });
    } else {
      // Use main database for admin if separate URI not provided
      adminDB = mainDB;
      logger.info('Using main database for admin operations');
    }

    // Wait for connections to be established
    await Promise.all([
      mainDB.asPromise(),
      adminDB !== mainDB ? adminDB.asPromise() : Promise.resolve()
    ]);

    logger.info('All database connections established');
    return { mainDB, adminDB };

  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
}

/**
 * Get main database connection
 */
function getMainDB() {
  if (!mainDB) {
    throw new Error('Main database not initialized. Call initializeDatabases() first.');
  }
  return mainDB;
}

/**
 * Get admin database connection
 */
function getAdminDB() {
  if (!adminDB) {
    throw new Error('Admin database not initialized. Call initializeDatabases() first.');
  }
  return adminDB;
}

/**
 * Close all database connections
 */
async function closeDatabases() {
  try {
    const promises = [];
    
    if (mainDB && mainDB.readyState === 1) {
      promises.push(mainDB.close());
    }
    
    if (adminDB && adminDB !== mainDB && adminDB.readyState === 1) {
      promises.push(adminDB.close());
    }

    await Promise.all(promises);
    logger.info('All database connections closed');
  } catch (error) {
    logger.error('Error closing database connections:', error);
    throw error;
  }
}

/**
 * Check database health
 */
async function checkDatabaseHealth() {
  const health = {
    mainDB: {
      status: 'disconnected',
      readyState: mainDB ? mainDB.readyState : 0
    },
    adminDB: {
      status: 'disconnected', 
      readyState: adminDB ? adminDB.readyState : 0
    }
  };

  if (mainDB) {
    health.mainDB.status = mainDB.readyState === 1 ? 'connected' : 'disconnected';
    try {
      await mainDB.db.admin().ping();
      health.mainDB.ping = 'success';
    } catch (error) {
      health.mainDB.ping = 'failed';
      health.mainDB.error = error.message;
    }
  }

  if (adminDB && adminDB !== mainDB) {
    health.adminDB.status = adminDB.readyState === 1 ? 'connected' : 'disconnected';
    try {
      await adminDB.db.admin().ping();
      health.adminDB.ping = 'success';
    } catch (error) {
      health.adminDB.ping = 'failed';
      health.adminDB.error = error.message;
    }
  } else if (adminDB === mainDB) {
    health.adminDB = { ...health.mainDB, note: 'Using main database' };
  }

  return health;
}

module.exports = {
  initializeDatabases,
  getMainDB,
  getAdminDB,
  closeDatabases,
  checkDatabaseHealth
};