const mongoose = require('mongoose');

async function connect(uri) {
  if (!uri) {
    throw new Error('MONGO_URI is not set');
  }
  await mongoose.connect(uri);
  return mongoose.connection;
}

module.exports = {
  connect,
  connection: mongoose.connection,
};
