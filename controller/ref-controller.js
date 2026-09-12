const Influencer = require("../models/influencer");
const ReferralEvent = require("../models/referralEvent");

/**
 * Public tracking beacons fired by the frontend (pages/i/[code].js on click,
 * pages/_app.js on appinstalled). Deliberately forgiving: an invalid or
 * missing code, or any write failure, still returns 200 — this must never
 * surface an error to a customer-facing page, and a broken beacon is not
 * worth retry logic.
 */

async function recordEvent(req, res, type) {
  try {
    const code = String(req.body?.code || "").trim();
    if (!code) return res.status(200).json({ ok: true });

    const influencer = await Influencer.findOne({ code, active: true }).select("_id");
    // Still logged even if the code is unknown/inactive, so a mistyped or
    // retired code is visible in the raw event log rather than silently
    // vanishing — just with no influencerId to roll it up under.
    await ReferralEvent.create({
      code,
      influencerId: influencer?._id,
      type,
      path: typeof req.body?.path === "string" ? req.body.path.slice(0, 200) : undefined,
      userAgent: (req.headers["user-agent"] || "").slice(0, 200),
    });
  } catch (err) {
    console.error(`ref ${type} event failed (ignored):`, err.message);
  }
  res.status(200).json({ ok: true });
}

const recordClick = (req, res) => recordEvent(req, res, "click");
const recordInstall = (req, res) => recordEvent(req, res, "install");

module.exports = { recordClick, recordInstall };
