const mongoose = require("mongoose");

/**
 * One row per influencer in the referral program. The code is the whole
 * mechanism — it's what the link (chowspace.ng/i/<code>) and every
 * ReferralEvent / Order.referral carry. Created only by an admin
 * (controller/influencer-controller.js createInfluencer); there is no
 * self-serve signup.
 */
const influencerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    handle: { type: String, trim: true, default: "" }, // e.g. @theirhandle, optional
    code: { type: String, required: true, unique: true, index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Influencer", influencerSchema);
