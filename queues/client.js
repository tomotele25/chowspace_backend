const { Client, Receiver } = require("@upstash/qstash");

/**
 * QStash connection details.
 *
 * QStash inverts the usual queue: instead of a worker process pulling jobs
 * from Redis, Upstash POSTs each job to an HTTP endpoint on this API and
 * retries on its own if we answer with an error. That matters here because
 * the API runs on Vercel, whose functions exit after each request — there is
 * nowhere for a process that must stay alive to live.
 *
 * Cached at module scope so a warm Vercel invocation reuses the client
 * instead of rebuilding it per request.
 */
let client = null;
let receiver = null;

/** Publisher. Null when QSTASH_TOKEN isn't set — callers then send inline. */
function getClient() {
  if (client) return client;
  if (!process.env.QSTASH_TOKEN) return null;
  client = new Client({ token: process.env.QSTASH_TOKEN });
  return client;
}

/**
 * Verifier for incoming job deliveries.
 *
 * Non-optional. The job endpoint is a public URL that sends email on demand;
 * without a signature check anyone who found it could send mail from the
 * Chowspace address to anyone they liked.
 *
 * Two keys because Upstash rotates them: the current one and the next one are
 * both accepted, so a rotation doesn't reject live traffic.
 */
function getReceiver() {
  if (receiver) return receiver;
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next) return null;
  receiver = new Receiver({
    currentSigningKey: current,
    nextSigningKey: next,
  });
  return receiver;
}

/** True when jobs can be published at all. */
function queuesEnabled() {
  return Boolean(process.env.QSTASH_TOKEN);
}

/**
 * Where QStash should deliver jobs back to.
 *
 * Must be publicly reachable — localhost is invisible to Upstash, which is
 * why local development falls back to sending inline rather than pretending
 * to queue.
 */
function jobsUrl(path) {
  const base = process.env.API_PUBLIC_URL || "https://chowspace-backend.vercel.app";
  return `${base.replace(/\/$/, "")}${path}`;
}

module.exports = { getClient, getReceiver, queuesEnabled, jobsUrl };
