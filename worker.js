require("dotenv").config();

const { startEmailWorker } = require("./workers/email.worker");

/**
 * The worker process.
 *
 * Deployed separately from the API — Railway, Render, a VM, anything that
 * keeps a process running. Vercel cannot host this: its functions exit after
 * each request, and a worker's whole job is to sit blocked on Redis waiting.
 *
 * Run with:  node worker.js   (npm run worker)
 */

if (!process.env.REDIS_URL) {
  console.error(
    "REDIS_URL is not set. The worker has nothing to connect to, so it is " +
      "exiting rather than idling and appearing healthy.",
  );
  process.exit(1);
}

const workers = [startEmailWorker()];
console.log(`[worker] started, consuming ${workers.length} queue(s)`);

/**
 * Deploys send SIGTERM and then kill the process shortly after. Closing the
 * workers first lets an in-flight send finish; without this a deploy landing
 * mid-job would drop that job back to the queue in an unknown state — for
 * email, that risks sending twice.
 */
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received, finishing in-flight jobs…`);
  try {
    await Promise.all(workers.map((w) => w.close()));
    console.log("[worker] closed cleanly");
    process.exit(0);
  } catch (err) {
    console.error("[worker] error during shutdown:", err.message);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
