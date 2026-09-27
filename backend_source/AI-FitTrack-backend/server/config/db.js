const dns = require('node:dns');
const mongoose = require('mongoose');

/**
 * Reusable MongoDB (Mongoose) connection module.
 *
 * The API is expected to talk to MongoDB Atlas, but any standard MongoDB
 * connection string works (local mongod, replica set, memory server in tests).
 */

const DEFAULT_OPTIONS = {
  // Fail fast with a meaningful error instead of hanging forever when the
  // cluster is unreachable / the IP address is not whitelisted in Atlas.
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
};

/**
 * Optional DNS escape hatch.
 * Some routers / ISP resolvers (and some VPNs) refuse SRV queries, which makes
 * every "mongodb+srv://" URI fail with "querySrv ECONNREFUSED". Setting
 * DNS_SERVERS=8.8.8.8,1.1.1.1 in server/.env makes the driver resolve SRV
 * records through those resolvers instead.
 * @returns {string[]|null} the resolvers that were applied, if any
 */
function applyCustomDnsServers() {
  const raw = process.env.DNS_SERVERS;
  if (!raw || !String(raw).trim()) return null;

  const servers = String(raw)
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);

  if (servers.length === 0) return null;

  dns.setServers(servers);
  return servers;
}


/**
 * Connect to MongoDB.
 * @param {string} [uri] connection string, defaults to process.env.MONGO_URI
 * @param {object} [options] extra mongoose connect options
 * @returns {Promise<import('mongoose').Mongoose>}
 */
async function connectDB(uri = process.env.MONGO_URI, options = {}) {
  if (!uri || !String(uri).trim()) {
    throw new Error(
      'MONGO_URI is not defined. Copy server/.env.example to server/.env and add your MongoDB Atlas connection string.'
    );
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const customDnsServers = applyCustomDnsServers();
  if (customDnsServers) {
    console.log(`[db] Using custom DNS resolver(s): ${customDnsServers.join(', ')}`);
  }

  mongoose.set('strictQuery', true);
  // Mongoose 8/9 builds indexes automatically (autoIndex defaults to true).
  mongoose.set('autoIndex', true);

  const connectOptions = { ...DEFAULT_OPTIONS, ...options };

  // NAT64/DNS64 networks can synthesize IPv6 addresses for IPv4-only Atlas
  // shards, which makes connections stall or close. MONGO_FORCE_IPV4=true
  // pins the driver to IPv4.
  if (String(process.env.MONGO_FORCE_IPV4 || '').toLowerCase() === 'true') {
    connectOptions.family = 4;
    console.log('[db] Forcing IPv4 for the MongoDB connection (MONGO_FORCE_IPV4=true)');
  }

  // Optional: keep credentials out of the URI so passwords containing
  // characters like @ # / % : ? (which MUST be URL-encoded inside a URI) can be
  // pasted verbatim. Used when MONGO_USER + MONGO_PASSWORD are set; the URI
  // should then be credential-free, e.g.
  //   mongodb+srv://cluster0.xxxxx.mongodb.net/ai-fittrack?retryWrites=true&w=majority
  if (process.env.MONGO_USER && process.env.MONGO_PASSWORD) {
    connectOptions.auth = {
      username: process.env.MONGO_USER,
      password: process.env.MONGO_PASSWORD,
    };
    connectOptions.authSource = process.env.MONGO_AUTH_SOURCE || 'admin';
    console.log(
      `[db] Using MONGO_USER/MONGO_PASSWORD credentials (authSource=${connectOptions.authSource}, no URL-encoding needed)`
    );
  }

  try {
    const conn = await mongoose.connect(uri, connectOptions);
    const target = `${conn.connection.host || 'unknown-host'}/${conn.connection.name || 'unknown-db'}`;
    console.log(`[db] MongoDB connected -> ${target}`);
    return conn;
  } catch (error) {
    const hint = /ENOTFOUND|ETIMEDOUT|Could not connect|selection timed out|timed out/i.test(error.message)
      ? ' Check the connection string, the cluster status and the Atlas Network Access (IP allow list).'
      : '';
    throw new Error(`MongoDB connection failed: ${error.message}.${hint}`);
  }
}

/** Close the current connection (used by graceful shutdown and tests). */
async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[db] MongoDB connection closed');
  }
}

module.exports = { connectDB, disconnectDB, applyCustomDnsServers };
