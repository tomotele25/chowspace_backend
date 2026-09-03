/**
 * Per-vendor order counts in one aggregate rather than a query per vendor —
 * same shape as productCountsByVendor in utils/vendorVisibility.js.
 *
 * Checkout runs over WhatsApp, so almost no order ever reaches
 * paymentStatus "paid". "How busy is this vendor" therefore counts every
 * order that wasn't cancelled, not just paid ones.
 */

/**
 * @param {import("mongoose").Model} Order
 * @param {Date} sinceDate  only orders created on/after this are counted
 * @returns {Promise<Map<string, number>>} keyed by vendor id string
 */
const recentOrderCountsByVendor = async (Order, sinceDate) => {
  const rows = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: sinceDate },
        status: { $ne: "cancelled" },
      },
    },
    { $group: { _id: "$vendorId", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
};

module.exports = { recentOrderCountsByVendor };
