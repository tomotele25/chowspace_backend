/**
 * Serial send queue with a minimum gap between sends.
 *
 * WhatsApp bans numbers that behave like software: bursts of identical
 * messages, many sends per second. Funnelling every send through one queue
 * that waits WA_MIN_INTERVAL_MS between each keeps the pace human even when
 * several order jobs arrive at once.
 *
 * enqueue() resolves/rejects with the underlying send's result, so the HTTP
 * handler can still return the right status code to QStash — it just waits
 * its turn first.
 */
const MIN_INTERVAL_MS = Number(process.env.WA_MIN_INTERVAL_MS || 45000);

let chain = Promise.resolve();
let lastSentAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function enqueue(task) {
  const run = chain.then(async () => {
    const wait = lastSentAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      lastSentAt = Date.now();
    }
  });
  // Keep the chain alive even if this task throws.
  chain = run.catch(() => {});
  return run;
}

module.exports = { enqueue, MIN_INTERVAL_MS };
