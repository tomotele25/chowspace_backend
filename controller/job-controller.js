const { getReceiver } = require("../queues/client");
const { deliver } = require("../queues/templates");

/**
 * Delivery endpoint for queued emails.
 *
 * QStash POSTs here once per job and retries on any non-2xx, so the status
 * code is the retry signal:
 *
 *   2xx  done, don't send again
 *   5xx  try again later
 *   4xx  refuse permanently — a malformed job would fail identically forever,
 *        and retrying it just delays the jobs behind it
 */
const handleEmailJob = async (req, res) => {
  // req.body is a Buffer here: the route is mounted with a raw parser because
  // the signature covers the exact bytes Upstash sent. Re-serialising parsed
  // JSON would reorder keys and the signature would never match.
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";

  const receiver = getReceiver();
  if (!receiver) {
    // Refusing rather than trusting the caller. This endpoint sends mail from
    // the Chowspace address on demand; unsigned, it is an open relay for
    // anyone who finds the URL.
    console.error("[jobs] signing keys are not configured — refusing job");
    return res.status(500).json({ error: "Job verification not configured" });
  }

  try {
    const valid = await receiver.verify({
      signature: req.headers["upstash-signature"],
      body: raw,
    });
    if (!valid) throw new Error("bad signature");
  } catch (err) {
    console.error("[jobs] rejected unsigned or forged request:", err.message);
    return res.status(401).json({ error: "Invalid signature" });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: "Malformed job body" });
  }

  const { template, to, data } = payload || {};
  if (!template || !to) {
    return res.status(400).json({ error: "Job is missing template or to" });
  }

  try {
    await deliver({ template, to, data });
    console.log(`[jobs] sent ${template} -> ${to}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    // An unknown template will never succeed, so it is refused outright
    // rather than retried for a day.
    if (/Unknown email template/.test(err.message)) {
      console.error(`[jobs] ${err.message} — not retrying`);
      return res.status(400).json({ error: err.message });
    }
    // Anything else — SMTP refusing, a timeout — is worth another attempt.
    console.error(`[jobs] send failed for ${template} -> ${to}:`, err.message);
    return res.status(500).json({ error: "Send failed, will retry" });
  }
};

module.exports = { handleEmailJob };
