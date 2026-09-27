/**
 * Shared test helpers for the AI FitTrack API test suite.
 *
 * Uses mongodb-memory-server so the automated tests run against a real MongoDB
 * engine without touching the developer's Atlas cluster.
 */
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// Deterministic environment for tests (dotenv never overrides existing values).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-0123456789abcdef0123456789abcdef';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

let mongod;

/** Start an in-memory MongoDB instance and connect Mongoose to it. */
async function startTestDatabase() {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri('ai-fittrack-test');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 30000 });
  return process.env.MONGO_URI;
}

/** Drop all collections between test cases. */
async function clearDatabase() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}

/** Stop Mongoose and the in-memory server. */
async function stopTestDatabase() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

module.exports = { startTestDatabase, clearDatabase, stopTestDatabase };
