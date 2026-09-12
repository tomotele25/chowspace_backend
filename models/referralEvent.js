const mongoose = require("mongoose");

/**
 * One row per click or install attributed to an influencer link.
 *
 * Deliberately thin — no raw IP, no full user agent — this exists to answer
 * "how many clicks/installs did this code generate", not to fingerprint
 * visitors. Order.referral (models/order.js) is the record of what actually
 * converted; this is the funnel above it.
 */
const referralEventSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, index: true },
    influencerId: { type: mongoose.Schema.Types.ObjectId, ref: "Influencer" },
    type: { type: String, enum: ["click", "install"], required: true },
    path: String, // where the click was headed, e.g. /vendors/menu/some-vendor
    userAgent: { type: String, maxlength: 200 },
    at: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

referralEventSchema.index({ code: 1, at: -1 });

module.exports = mongoose.model("ReferralEvent", referralEventSchema);
