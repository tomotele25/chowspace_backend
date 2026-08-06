const { Worker } = require("bullmq");
const { getConnection } = require("../queues/connection");
const { EMAIL_QUEUE } = require("../queues/email");
const { deliver } = require("../queues/templates");

/**
 * Consumer side of the email queue.
 *
 * Only ever started from worker.js, which runs on a host that keeps a process
 * alive. Nothing in the API path may require this file.
 */
function startEmailWorker() {
  const connection = getConnection();
  if (!connection) {
    throw new Error("REDIS_URL is not set — the worker has nothing to consume");
  }

  const worker = new Worker(
    EMAIL_QUEUE,
    async (job) => {
      const { template, to, data } = job.data;
      await deliver({ template, to, data });
      return { template, to };
    },
    {
      connection,
      // Gmail's SMTP throttles aggressively and answers a burst with a
      // temporary failure, which would burn attempts on jobs that were fine.
      concurrency: 5,
    },
  );

  worker.on("completed", (job) => {
    console.log(`[email] sent ${job.data.template} -> ${job.data.to}`);
  });

  // A silent worker is the failure that matters here: signups keep succeeding
  // while no mail is sent. Every failed attempt is logged with the attempt
  // number, so a run of retries is visible rather than looking like silence.
  worker.on("failed", (job, err) => {
    const attempt = job?.attemptsMade ?? "?";
    const max = job?.opts?.attempts ?? "?";
    console.error(
      `[email] FAILED ${job?.data?.template} -> ${job?.data?.to} ` +
        `(attempt ${attempt}/${max}): ${err.message}`,
    );
  });

  worker.on("error", (err) => {
    console.error("[email] worker error:", err.message);
  });

  return worker;
}

module.exports = { startEmailWorker };
