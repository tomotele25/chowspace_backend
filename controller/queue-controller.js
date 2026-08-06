const { getEmailQueue } = require("../queues/email");
const { queuesEnabled } = require("../queues/connection");

/**
 * Queue health, for the admin UI.
 *
 * The failure this exists to catch is a worker that has died quietly: signups
 * keep succeeding, mail keeps being accepted onto the queue, and nothing is
 * ever delivered. Nothing in the request path notices, because from the API's
 * side enqueueing worked.
 *
 * A rising `waiting` with nothing `active` is that picture.
 */
const getQueueStats = async (req, res) => {
  try {
    if (!queuesEnabled()) {
      return res.status(200).json({
        success: true,
        enabled: false,
        message:
          "REDIS_URL is not set, so email is sent inline on the request. " +
          "Nothing is queued and no worker is needed.",
      });
    }

    const queue = getEmailQueue();
    if (!queue) {
      return res.status(503).json({
        success: false,
        enabled: true,
        message: "Queue configured but the Redis connection is unavailable.",
      });
    }

    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
    );

    // The last few failures by name and message — enough to tell a bad
    // address apart from SMTP credentials that have stopped working.
    const failed = await queue.getFailed(0, 9);

    res.status(200).json({
      success: true,
      enabled: true,
      queue: "email",
      counts,
      recentFailures: failed.map((job) => ({
        id: job.id,
        template: job.data?.template,
        to: job.data?.to,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
        failedAt: job.finishedOn ? new Date(job.finishedOn) : null,
      })),
    });
  } catch (err) {
    console.error("getQueueStats error:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Could not read queue stats" });
  }
};

module.exports = { getQueueStats };
