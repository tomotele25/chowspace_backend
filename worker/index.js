require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");

const { getReceiver } = require("../queues/client");
const { getRedis } = require("../queues/redis");
const { renderWhatsapp, isKnownWhatsappTemplate } = require("./templates");
const { start, sendText, status } = require("./baileys");
const { enqueue } = require("./throttle");

/**
 * The Baileys worker.
 *
 * A long-lived process (Render), because Vercel functions exit after each
 * request and can't hold a WhatsApp socket. QStash delivers send jobs here
 * over HTTP; everything about pacing and safety lives on this side so the
 * API never has to think about it.
 */

const PORT = process.env.PORT || 3020;
const DAY_SECONDS = 86400;
const MARKETING_GAP_SECONDS = 14 * DAY_SECONDS;

function utcDateKey(d = new Date()) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
function campaignOf(template) {
  return template === "wa-first-order" ? "wa-first-order" : "wa-returning";
}

/**
 * The full decision + send for one job. Returns { status, body } so the HTTP
 * route can pass the right code back to QStash:
 *   200  handled (sent, or a permanent skip)
 *   400  malformed / unknown template — never retried
 *   500  transient (not connected, cap reached) — QStash retries
 */
async function processJob({ template, to, data }) {
  if (!template || !to || !isKnownWhatsappTemplate(template)) {
    return { status: 400, body: { error: "bad template or recipient" } };
  }

  const redis = getRedis();
  if (!redis) return { status: 500, body: { error: "redis unavailable" } };

  try {
    // Re-check opt-out here: someone could have replied STOP between the API
    // enqueue and now.
    if (await redis.get(`wa:optout:${to}`)) {
      return { status: 200, body: { skipped: "opted out" } };
    }

    const campaign = campaignOf(template);
    if (await redis.get(`wa:sent:${to}:${campaign}`)) {
      return { status: 200, body: { skipped: "already sent" } };
    }

    // 14-day gap between any two non-first-order messages to the same person.
    // The API enqueue checks this too, but the worker is the real gate — a job
    // can sit in QStash across the boundary.
    if (
      template === "wa-returning" &&
      (await redis.get(`wa:sent:${to}:marketing`))
    ) {
      return { status: 200, body: { skipped: "within marketing gap" } };
    }

    // Authoritative daily cap — the API increments optimistically, the worker
    // is the real gate.
    const quotaKey = `wa:quota:${utcDateKey()}`;
    const used = await redis.incr(quotaKey);
    if (used === 1) await redis.expire(quotaKey, 2 * DAY_SECONDS);
    const cap = Number(process.env.WA_DAILY_CAP || 60);
    if (used > cap) {
      await redis.decr(quotaKey); // give the slot back, retry later today
      return { status: 500, body: { error: "daily cap reached, retry later" } };
    }

    const text = renderWhatsapp({ template, data });
    await enqueue(() => sendText(to, text));

    if (campaign === "wa-first-order") {
      await redis.set(`wa:sent:${to}:${campaign}`, "1");
    } else {
      await redis.set(`wa:sent:${to}:${campaign}`, "1", {
        ex: MARKETING_GAP_SECONDS,
      });
    }
    await redis.set(`wa:sent:${to}:marketing`, "1", { ex: MARKETING_GAP_SECONDS });

    console.log(`[wa-worker] sent ${template} -> ${to}`);
    return { status: 200, body: { ok: true } };
  } catch (err) {
    console.error(`[wa-worker] send failed for ${to}:`, err.message);
    return { status: 500, body: { error: "send failed, will retry" } };
  }
}

const app = express();

// GET /health — used by the admin status proxy and by a 10-minute QStash
// schedule that keeps the free Render service from idling out.
app.get("/health", async (req, res) => {
  const redis = getRedis();
  const s = status();
  let sendsToday = null;
  try {
    if (redis) {
      sendsToday = Number((await redis.get(`wa:quota:${utcDateKey()}`)) || 0);
    }
  } catch {
    /* health must not throw */
  }
  const cap = Number(process.env.WA_DAILY_CAP || 60);
  res.json({
    ok: true,
    waConnected: s.connected,
    loggedOut: s.stopped,
    lastQrAt: s.lastQrAt,
    sendsToday,
    quotaLeft: sendsToday == null ? null : Math.max(0, cap - sendsToday),
  });
});

// POST /jobs/whatsapp — one send job from QStash. Signature-verified.
app.post(
  "/jobs/whatsapp",
  express.raw({ type: "*/*", limit: "1mb" }),
  async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";

    const receiver = getReceiver();
    if (!receiver) {
      console.error("[wa-worker] signing keys not configured — refusing job");
      return res.status(500).json({ error: "verification not configured" });
    }
    try {
      const valid = await receiver.verify({
        signature: req.headers["upstash-signature"],
        body: raw,
      });
      if (!valid) throw new Error("bad signature");
    } catch (err) {
      console.error("[wa-worker] rejected forged request:", err.message);
      return res.status(401).json({ error: "invalid signature" });
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: "malformed job body" });
    }

    const { status: code, body } = await processJob(payload || {});
    return res.status(code).json(body);
  },
);

/**
 * One-shot smoke test. Set WA_TEST_TO=2349160356953 and run the worker: once
 * the number is linked it sends a single wa-first-order message straight to
 * that phone, bypassing the Redis guards, then logs the result. Remove the
 * env var for normal operation.
 */
async function runTestSend(to) {
  console.log(`[wa-worker] WA_TEST_TO set — waiting for link to send to ${to}`);
  const deadline = Date.now() + 120000;
  while (!status().connected) {
    if (status().stopped) {
      console.error("[wa-worker] logged out before test send");
      return;
    }
    if (Date.now() > deadline) {
      console.error("[wa-worker] not linked within 2 min — test send skipped");
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  try {
    const text = renderWhatsapp({
      template: "wa-first-order",
      data: { name: "there", vendorName: "ChowSpace", orderId: "CS-TEST" },
    });
    await enqueue(() => sendText(to, text));
    console.log(`[wa-worker] TEST SEND OK -> ${to}`);
  } catch (err) {
    console.error(`[wa-worker] TEST SEND FAILED -> ${to}:`, err.message);
  }
}

async function main() {
  if (!process.env.DB_URL) throw new Error("DB_URL not set");
  await mongoose.connect(process.env.DB_URL);
  console.log("[wa-worker] mongo connected");

  await start(mongoose.connection.db);

  app.listen(PORT, () => console.log(`[wa-worker] listening on :${PORT}`));

  if (process.env.WA_TEST_TO) runTestSend(process.env.WA_TEST_TO);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[wa-worker] fatal:", err);
    process.exit(1);
  });
}

module.exports = { app, main, processJob };
