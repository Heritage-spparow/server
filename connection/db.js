const mongoose = require('mongoose');

// The connection variable is kept outside the function scope.
// In a serverless environment, this variable will persist across
// warm lambda invocations.
let cachedConnection = null;

async function connect(uri) {
  if (!uri) {
    throw new Error('MONGO_URI is not set');
  }

  if (mongoose.connection.readyState === 1) {
    console.log('Using existing MongoDB connection.');
    return mongoose.connection;
  }

  if (mongoose.connection.readyState === 2 && cachedConnection) {
     console.log('Waiting for connection in progress...');
 
     await cachedConnection; 
     return mongoose.connection;
  }

  // New connection attempt
  console.log('Establishing new MongoDB connection...');
  cachedConnection = mongoose.connect(uri);
  await cachedConnection; 
  
  return mongoose.connection;
}

module.exports = {
  connect,
  connection: mongoose.connection,
};