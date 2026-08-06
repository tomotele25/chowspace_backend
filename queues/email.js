const { Queue } = require("bullmq");
const { getConnection, queuesEnabled } = require("./connection");
const { deliver, isKnownTemplate } = require("./templates");

/**
 * Producer side of the email queue.
 *
 * This module must never construct a Worker. Workers block on Redis waiting
 * for jobs, which needs a process that stays alive; Vercel functions exit
 * after each request. A Worker created here would appear to work locally and
 * then process nothing in production, with no error to notice — the classic
 * way to get this wrong. Consuming lives in workers/email.worker.js, started
 * only by worker.js on a host that keeps a process running.
 */

const EMAIL_QUEUE = "email";

const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5000 },
  // Without these two, Redis grows without bound: completed jobs are kept
  // forever by default, and Upstash bills by storage.
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  // Failures are kept a week — long enough to notice on a Monday that
  // something broke on a Saturday.
  removeOnFail: { age: 7 * 24 * 3600 },
};

/**
 * How long to wait for Redis to accept a job before giving up and sending
 * inline.
 *
 * This is not belt-and-braces — it is what makes the fallback work at all.
 * BullMQ requires `maxRetriesPerRequest: null`, which tells ioredis to queue
 * commands indefinitely rather than fail them. So when Redis is unreachable
 * `queue.add()` does not reject: it hangs forever. Without a deadline the
 * fallback below would never run and vendor signup would hang with it.
 *
 * Two seconds is far above a healthy Upstash round trip and far below any
 * sensible request timeout.
 */
const ENQUEUE_TIMEOUT_MS = 2000;

let queue = null;

const timeout = (ms) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`enqueue timed out after ${ms}ms`)), ms),
  );

function getEmailQueue() {
  if (queue) return queue;
  const connection = getConnection();
  if (!connection) return null;
  queue = new Queue(EMAIL_QUEUE, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  return queue;
}

/**
 * Queues an email, falling back to sending it inline.
 *
 * The fallback is load-bearing, not caution. The vendor confirmation email
 * gates login: a vendor who never receives it can never sign in. If a Redis
 * outage meant the mail were merely dropped, no new vendor could join the
 * platform until someone noticed. So when the queue is unavailable — not
 * configured, unreachable, or refusing writes — this sends directly instead.
 *
 * Resolves to { queued, sent }:
 *   queued  the job reached Redis and a worker will deliver it
 *   sent    the mail is on its way by one route or the other
 *
 * Callers reporting `emailSent` to the frontend should use `sent`, so that
 * a false still means "nothing was sent by any route" and the existing
 * contract with the signup page is unchanged.
 */
async function enqueueEmail({ template, to, data = {} }) {
  if (!to) return { queued: false, sent: false };

  // Checked before either route: an unknown key is a programming error and
  // should surface the same way whether or not Redis happens to be up.
  if (!isKnownTemplate(template)) {
    console.error(`[queues] refusing unknown email template: ${template}`);
    return { queued: false, sent: false };
  }

  if (queuesEnabled()) {
    try {
      const q = getEmailQueue();
      if (q) {
        await Promise.race([
          q.add(template, { template, to, data }),
          timeout(ENQUEUE_TIMEOUT_MS),
        ]);
        return { queued: true, sent: true };
      }
    } catch (err) {
      console.error(
        `[queues] enqueue failed for ${template}, sending inline:`,
        err.message,
      );
    }
  }

  try {
    await deliver({ template, to, data });
    return { queued: false, sent: true };
  } catch (err) {
    console.error(`[queues] inline send failed for ${template}:`, err.message);
    return { queued: false, sent: false };
  }
}

module.exports = {
  EMAIL_QUEUE,
  DEFAULT_JOB_OPTIONS,
  ENQUEUE_TIMEOUT_MS,
  getEmailQueue,
  enqueueEmail,
};
