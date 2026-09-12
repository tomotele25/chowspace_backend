const Influencer = require("../models/influencer");
const ReferralEvent = require("../models/referralEvent");
const Order = require("../models/order");
const { uniqueReferralCode } = require("../utils/referralCode");

/**
 * Admin-only influencer program: create a code, see how it's performing.
 * No self-serve signup — an admin vets and creates each influencer, mirroring
 * how vendor accounts are the only source of Vendor.slug.
 */

const createInfluencer = async (req, res) => {
  try {
    const { name, handle } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: "name is required" });
    }

    const code = await uniqueReferralCode(name);
    const influencer = await Influencer.create({
      name: String(name).trim(),
      handle: handle ? String(handle).trim() : "",
      code,
    });

    const base = process.env.APP_PUBLIC_URL || "https://chowspace.ng";
    res.status(201).json({
      success: true,
      influencer,
      link: `${base.replace(/\/$/, "")}/i/${code}`,
    });
  } catch (err) {
    console.error("createInfluencer error:", err.message);
    res.status(500).json({ success: false, message: "Could not create influencer" });
  }
};

/**
 * Every influencer with clicks, installs, orders and revenue attached —
 * one screen for "is this partnership working".
 *
 * Two aggregates rather than a query per influencer: same reasoning as
 * recentOrderCountsByVendor in utils/orderStats.js.
 */
const listInfluencers = async (req, res) => {
  try {
    const [influencers, eventRows, orderRows] = await Promise.all([
      Influencer.find({}).sort({ createdAt: -1 }).lean(),
      ReferralEvent.aggregate([
        { $group: { _id: { code: "$code", type: "$type" }, count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { "referral.code": { $ne: null }, status: { $ne: "cancelled" } } },
        {
          $group: {
            _id: "$referral.code",
            orders: { $sum: 1 },
            revenue: { $sum: "$totalAmount" },
          },
        },
      ]),
    ]);

    const clicks = new Map();
    const installs = new Map();
    for (const r of eventRows) {
      const map = r._id.type === "install" ? installs : clicks;
      map.set(r._id.code, r.count);
    }
    const orders = new Map(orderRows.map((r) => [r._id, r.orders]));
    const revenue = new Map(orderRows.map((r) => [r._id, r.revenue]));

    const base = process.env.APP_PUBLIC_URL || "https://chowspace.ng";
    const report = influencers.map((inf) => {
      const c = clicks.get(inf.code) || 0;
      const o = orders.get(inf.code) || 0;
      return {
        ...inf,
        link: `${base.replace(/\/$/, "")}/i/${inf.code}`,
        clicks: c,
        installs: installs.get(inf.code) || 0,
        orders: o,
        revenue: revenue.get(inf.code) || 0,
        conversionRate: c > 0 ? Number(((o / c) * 100).toFixed(1)) : 0,
      };
    });

    res.status(200).json({ success: true, influencers: report });
  } catch (err) {
    console.error("listInfluencers error:", err.message);
    res.status(500).json({ success: false, message: "Could not load influencers" });
  }
};

module.exports = { createInfluencer, listInfluencers };
