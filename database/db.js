require("dotenv").config();
const mongoose = require("mongoose");

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;
// How long a single attempt waits before deciding the cluster is
// unreachable. This was 60000 (a full minute) per attempt — harmless before,
// because connectToDb() never actually awaited it (see git history), so a
// slow/failed attempt retried silently in the background. Now that it's
// correctly awaited by startServer(), that same 60s-per-attempt config means
// a real hiccup blocks server startup for up to 5 minutes (5 attempts).
// 8s is enough for a healthy connection (observed ~2s) with room to spare,
// and fails over to the next attempt fast instead of hanging.
const SERVER_SELECTION_TIMEOUT_MS = 8000;

/**
 * Cached across invocations on the same warm Vercel lambda, the standard fix
 * for serverless + Mongoose: without it, every request that happened to
 * import this module fresh (or every call site that awaited connectToDb())
 * would call mongoose.connect() again, paying a full handshake
 * (serverSelectionTimeoutMS: 60000) even when a connection was already open
 * or already being established.
 */
let connectionPromise = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectWithRetry(attempt = 0) {
  try {
    await mongoose.connect(process.env.DB_URL, {
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
      // Unrelated to connection setup — this bounds an idle established
      // socket during a long-running query, not the initial handshake, so
      // it stays generous.
      socketTimeoutMS: 60000,
    });
    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error(
      `❌ MongoDB connection failed (attempt ${attempt + 1}):`,
      err.message,
    );
    if (attempt + 1 >= MAX_RETRIES) {
      console.error("🚨 Max retry attempts reached. Could not connect to MongoDB.");
      throw err;
    }
    console.log(`🔁 Retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
    await sleep(RETRY_DELAY_MS);
    return connectWithRetry(attempt + 1);
  }
}

const connectToDb = () => {
  // Already connected or actively connecting — reuse it rather than opening
  // a second connection. readyState: 0 disconnected, 1 connected,
  // 2 connecting, 3 disconnecting.
  if (mongoose.connection.readyState === 1) return Promise.resolve();

  if (!connectionPromise) {
    connectionPromise = connectWithRetry().catch((err) => {
      // A failed attempt shouldn't wedge every future call into replaying a
      // dead promise — clear it so the next invocation gets a fresh attempt.
      connectionPromise = null;
      throw err;
    });
  }

  return connectionPromise;
};

module.exports = connectToDb;
