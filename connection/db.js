const mongoose = require('mongoose');

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connect(uri) {
  if (!uri) {
    throw new Error('MONGO_URI is not set');
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,         
      maxPoolSize: 5,                
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,               
    };

    cached.promise = mongoose.connect(uri, opts).then((mongooseInstance) => {
      console.log('New MongoDB connection established');
      return mongooseInstance;
    }).catch((err) => {
      console.error('MongoDB connection error:', err);
      cached.promise = null; 
      throw err;
    });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
}

module.exports = {
  connect,
  connection: mongoose.connection,
};