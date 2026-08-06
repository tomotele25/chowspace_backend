const { getClient, queuesEnabled, jobsUrl } = require("../queues/client");
const { EMAIL_JOB_PATH } = require("../queues/email");

/**
 * Queue health, for the admin UI.
 *
 * With QStash there is no worker process to die, which removes the classic
 * silent failure. What replaces it is quieter: jobs that exhausted their
 * retries and landed in the dead letter queue. Nothing in the request path
 * notices, because from the API's side publishing succeeded — the delivery
 * failed hours later, somewhere else.
 *
 * A non-empty DLQ is the thing to look at.
 */
const getQueueStats = async (req, res) => {
  try {
    if (!queuesEnabled()) {
      return res.status(200).json({
        success: true,
        enabled: false,
        message:
          "QSTASH_TOKEN is not set, so email is sent inline on the request. " +
          "Nothing is queued, which is expected in local development.",
      });
    }

    const client = getClient();
    if (!client) {
      return res
        .status(503)
        .json({ success: false, enabled: true, message: "QStash unavailable" });
    }

    const dlq = await client.dlq.listMessages();
    const messages = dlq?.messages || [];

    res.status(200).json({
      success: true,
      enabled: true,
      endpoint: jobsUrl(EMAIL_JOB_PATH),
      deadLetterCount: messages.length,
      // The most recent failures, enough to tell a bad address apart from
      // SMTP credentials that have stopped working.
      deadLetter: messages.slice(0, 10).map((m) => ({
        id: m.dlqId || m.messageId,
        template: safeTemplate(m.body),
        responseStatus: m.responseStatus,
        responseBody:
          typeof m.responseBody === "string"
            ? m.responseBody.slice(0, 200)
            : null,
        createdAt: m.createdAt ? new Date(m.createdAt) : null,
      })),
    });
  } catch (err) {
    console.error("getQueueStats error:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Could not read queue stats" });
  }
};

/** The body is whatever was published; never let a malformed one 500 this. */
function safeTemplate(body) {
  try {
    return JSON.parse(body)?.template ?? null;
  } catch {
    return null;
  }
}

module.exports = { getQueueStats };
