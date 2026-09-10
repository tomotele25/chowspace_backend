const { Redis } = require("@upstash/redis");

/**
 * Upstash Redis over HTTP.
 *
 * Used as a fast scratchpad for the WhatsApp messaging feature: a per-phone
 * order counter (first order vs returning), send dedup markers, an opt-out
 * flag, and a rolling daily send quota. None of it is a source of truth —
 * Mongo still is — so a miss or an outage only means a message doesn't go
 * out, never a broken order.
 *
 * Null when unconfigured, exactly like getClient() in ./client.js: callers
 * check for null and skip the messaging step rather than crash. Local
 * development runs fine with these unset.
 *
 * Cached at module scope so a warm Vercel invocation reuses the connection.
 */
let redis = null;

function getRedis() {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

module.exports = { getRedis };
