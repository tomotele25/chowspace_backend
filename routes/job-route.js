const express = require("express");
const { handleEmailJob } = require("../controller/job-controller");

const router = express.Router();

/**
 * Job deliveries from QStash.
 *
 * The raw body parser is required, not a preference: the Upstash signature is
 * computed over the exact bytes sent. If express.json() parsed this first,
 * verification would only ever see a re-serialised copy with its keys
 * reordered, and every job would be rejected as forged.
 *
 * Mounted in api/server.js ahead of express.json() for the same reason.
 */
router.post(
  "/jobs/email",
  express.raw({ type: "*/*", limit: "1mb" }),
  handleEmailJob,
);

module.exports = router;
