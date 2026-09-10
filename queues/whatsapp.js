const crypto = require("crypto");
const { getClient, queuesEnabled } = require("./client");
const { isKnownWhatsappTemplate } = require("./templates");

/**
 * Producer side of the WhatsApp queue.
 *
 * Publishes to QStash, which POSTs the job to the Baileys worker (a separate
 * always-on Render service, since Vercel can't hold a WhatsApp socket) and
 * retries on its own if that call fails.
 *
 * Unlike the email queue there is no inline fallback: the thing that can send
 * a WhatsApp message only exists inside the worker. If QStash is unavailable
 * the message is logged and dropped — a missed courtesy message is not worth
 * failing checkout over.
 */

const RETRIES = 3;
const PUBLISH_TIMEOUT_MS = 2000;

const timeout = (ms) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`publish timed out after ${ms}ms`)), ms),
  );

function deduplicationId({ template, to, data }) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ template, to, data }))
    .digest("hex");
}

/** Public URL of the Render worker, e.g. https://chowspace-wa.onrender.com */
function workerUrl(path) {
  const base = process.env.WA_WORKER_URL || "";
  return `${base.replace(/\/$/, "")}${path}`;
}

/**
 * Queues a WhatsApp message. Resolves to { queued } — true when QStash
 * accepted the job, false when it was dropped.
 */
async function enqueueWhatsapp({ template, to, data = {} }) {
  if (!to) return { queued: false };

  if (!isKnownWhatsappTemplate(template)) {
    console.error(`[wa] refusing unknown whatsapp template: ${template}`);
    return { queued: false };
  }

  if (!process.env.WA_WORKER_URL) {
    console.warn("[wa] WA_WORKER_URL not set — dropping message");
    return { queued: false };
  }

  if (!queuesEnabled()) {
    console.warn("[wa] QStash not configured — dropping message");
    return { queued: false };
  }

  try {
    const client = getClient();
    if (!client) return { queued: false };
    await Promise.race([
      client.publishJSON({
        url: workerUrl("/jobs/whatsapp"),
        body: { template, to, data },
        retries: RETRIES,
        deduplicationId: deduplicationId({ template, to, data }),
      }),
      timeout(PUBLISH_TIMEOUT_MS),
    ]);
    return { queued: true };
  } catch (err) {
    console.error(`[wa] publish failed for ${template}, dropping:`, err.message);
    return { queued: false };
  }
}

module.exports = {
  RETRIES,
  PUBLISH_TIMEOUT_MS,
  deduplicationId,
  workerUrl,
  enqueueWhatsapp,
};
