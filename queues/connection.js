const IORedis = require("ioredis");

/**
 * The single Redis connection shared by every queue in this process.
 *
 * Cached at module scope on purpose. On Vercel a warm function reuses its
 * module registry between invocations, so without this cache each request
 * would open a new connection and a burst of traffic would exhaust Upstash's
 * connection limit — which fails as timeouts on unrelated requests, a long
 * way from the cause.
 */
let connection = null;

/**
 * Returns the shared connection, or null when REDIS_URL isn't configured.
 *
 * Null rather than throwing: every caller already has to cope with Redis
 * being unreachable, and treating "not configured" as the same case means
 * local development and CI work with no Redis at all — the app sends its
 * email inline instead.
 */
function getConnection() {
  if (connection) return connection;
  if (!process.env.REDIS_URL) return null;

  connection = new IORedis(process.env.REDIS_URL, {
    // BullMQ refuses to start without this: it issues blocking commands that
    // must be allowed to wait rather than be retried out from under it.
    maxRetriesPerRequest: null,
    // Upstash doesn't support the INFO-based ready probe ioredis runs by
    // default, and the connection sits "connecting" forever with it on.
    enableReadyCheck: false,
  });

  connection.on("error", (err) => {
    // Logged, never thrown. An unhandled 'error' on an ioredis client takes
    // the whole process down, which would turn a Redis blip into an outage.
    console.error("[queues] redis error:", err.message);
  });

  return connection;
}

/** True when queueing is available at all. */
function queuesEnabled() {
  return Boolean(process.env.REDIS_URL);
}

module.exports = { getConnection, queuesEnabled };
