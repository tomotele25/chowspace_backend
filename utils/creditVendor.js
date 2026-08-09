const mongoose = require("mongoose");
const Order = require("../models/order");
const Wallet = require("../models/wallet");

/**
 * Credits a vendor for a paid order, exactly once.
 *
 * Three separate faults are addressed here, all of which lost money silently:
 *
 * 1. No wallet was ever created. `Wallet.findOne` was the only wallet call in
 *    the codebase — there is no `Wallet.create` anywhere — so for every vendor
 *    without a pre-existing document the credit was wrapped in `if (wallet)`
 *    and simply skipped. The order was marked paid, the customer was charged,
 *    and nothing was recorded. An upsert fixes it.
 *
 * 2. The vendor was credited the full amount the customer paid, including
 *    Chowspace's service fee. The platform earned nothing on the Monei path.
 *    Now the credit is `order.vendorShare` — food, packing and delivery — and
 *    the service fee stays behind.
 *
 * 3. `paymentStatus: "paid"` was committed before the credit, in a separate
 *    write. A failure between the two returned 500, the provider retried, the
 *    retry saw "already paid" and returned 200, and the credit was lost for
 *    good. Both writes now happen in one transaction: either the order is paid
 *    and the vendor is credited, or neither happened and the retry works.
 *
 * Idempotency is `walletCreditedAt`. The transaction only proceeds if it is
 * still null, so a webhook delivered twice — which providers do — credits once.
 *
 * @returns {{ credited: boolean, reason?: string, amount?: number }}
 */
async function creditVendorForOrder(orderId) {
  const session = await mongoose.startSession();

  try {
    let outcome = { credited: false, reason: "unknown" };

    await session.withTransaction(async () => {
      // Claim the order. The walletCreditedAt guard is what makes a repeated
      // delivery safe: the second one matches nothing and stops here.
      const order = await Order.findOneAndUpdate(
        { _id: orderId, walletCreditedAt: null },
        { $set: { paymentStatus: "paid", walletCreditedAt: new Date() } },
        { new: true, session },
      );

      if (!order) {
        outcome = { credited: false, reason: "already credited or not found" };
        return;
      }

      // Orders placed before server-side pricing have no vendorShare. Falling
      // back to totalAmount would hand over the service fee, so subtract it
      // where we know it and otherwise credit the total — better to overpay a
      // vendor slightly than to lose their money entirely.
      const amount =
        typeof order.vendorShare === "number"
          ? order.vendorShare
          : Math.max(0, (order.totalAmount || 0) - (order.serviceFee || 0));

      if (amount <= 0) {
        outcome = { credited: false, reason: "nothing to credit" };
        return;
      }

      // Upsert, so a vendor who has never been paid gets a wallet here rather
      // than being skipped. $inc rather than read-modify-write, so two
      // concurrent credits cannot lose one.
      await Wallet.findOneAndUpdate(
        { vendorId: order.vendorId },
        {
          $inc: { balance: amount },
          $push: {
            transactions: {
              type: "credit",
              amount,
              description: `Order ${order.orderId}`,
              date: new Date(),
            },
          },
          $setOnInsert: { vendorId: order.vendorId },
        },
        { upsert: true, new: true, session },
      );

      outcome = { credited: true, amount };
    });

    return outcome;
  } catch (err) {
    // Rethrow so the caller answers non-2xx and the provider retries. The
    // transaction has rolled back, so the retry sees walletCreditedAt still
    // null and does the whole thing properly.
    console.error(`creditVendorForOrder(${orderId}) failed:`, err.message);
    throw err;
  } finally {
    await session.endSession();
  }
}

module.exports = { creditVendorForOrder };
