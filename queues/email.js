const crypto = require("crypto");
const { getClient, queuesEnabled, jobsUrl } = require("./client");
const { deliver, isKnownTemplate } = require("./templates");

/**
 * Producer side of the email queue.
 *
 * Publishes to QStash, which POSTs the job back to /api/jobs/email and
 * retries on its own if that call fails. Delivery lives in
 * controller/job-controller.js.
 */

const EMAIL_JOB_PATH = "/api/jobs/email";

/**
 * QStash retries on any non-2xx, spacing attempts out over roughly a day.
 * Three is enough for an SMTP blip without a genuinely bad address sitting in
 * the queue for hours.
 */
const RETRIES = 3;

/**
 * How long to wait for QStash to accept a job before giving up and sending
 * inline.
 *
 * Publishing is an HTTPS call on the request path, so it can hang rather than
 * fail — a TCP connection that never completes doesn't reject on its own.
 * Without a deadline the fallback below would never run and vendor signup
 * would hang with it. Two seconds is well above a healthy round trip and well
 * below any sensible request timeout.
 */
const PUBLISH_TIMEOUT_MS = 2000;

const timeout = (ms) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`publish timed out after ${ms}ms`)), ms),
  );

/**
 * Stable id for a job, so a retry can't send the same mail twice.
 *
 * QStash guarantees at-least-once delivery: a response we sent that it never
 * received is retried, and the vendor gets the email again. Hashing the
 * template, recipient and payload means a genuine repeat — a vendor asking
 * for a second confirmation — still gets through, because the payload carries
 * a fresh token, while a mechanical retry does not.
 */
function deduplicationId({ template, to, data }) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ template, to, data }))
    .digest("hex");
}

/**
 * Queues an email, falling back to sending it inline.
 *
 * The fallback is load-bearing rather than cautious. The vendor confirmation
 * email gates login: a vendor who never receives it can never sign in. If an
 * Upstash outage meant the mail were merely dropped, no new vendor could join
 * the platform until someone noticed. So when publishing is unavailable —
 * not configured, unreachable, or slow — this sends directly instead.
 *
 * Resolves to { queued, sent }:
 *   queued  QStash accepted the job and will deliver it
 *   sent    the mail is on its way by one route or the other
 *
 * Callers reporting `emailSent` to the frontend should use `sent`, so a false
 * still means "nothing was sent by any route" and the existing contract with
 * the signup page is unchanged.
 */
async function enqueueEmail({ template, to, data = {} }) {
  if (!to) return { queued: false, sent: false };

  // Checked before either route: an unknown key is a programming error and
  // should surface the same way whether or not QStash happens to be up.
  if (!isKnownTemplate(template)) {
    console.error(`[queues] refusing unknown email template: ${template}`);
    return { queued: false, sent: false };
  }

  if (queuesEnabled()) {
    try {
      const client = getClient();
      if (client) {
        await Promise.race([
          client.publishJSON({
            url: jobsUrl(EMAIL_JOB_PATH),
            body: { template, to, data },
            retries: RETRIES,
            deduplicationId: deduplicationId({ template, to, data }),
          }),
          timeout(PUBLISH_TIMEOUT_MS),
        ]);
        return { queued: true, sent: true };
      }
    } catch (err) {
      console.error(
        `[queues] publish failed for ${template}, sending inline:`,
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
  EMAIL_JOB_PATH,
  RETRIES,
  PUBLISH_TIMEOUT_MS,
  deduplicationId,
  enqueueEmail,
};
