const { MoneiSDK } = require("monei-sdk");
const Order = require("../models/order");
const Vendor = require("../models/vendor");
const Wallet = require("../models/wallet");

/**
 * Pays a vendor out to their bank account as soon as their order is paid.
 *
 * The money arrives in the Chowspace Monei wallet first — the customer
 * transfers into a virtual account we generate — so a second step is needed to
 * move the vendor's share on to them. Chowspace's service fee is simply not
 * included in that transfer, which is how the fee is actually collected on
 * this path rather than invoiced later.
 *
 * The wallet balance is the ledger and stays the fallback. If a vendor has no
 * bank details, or Monei refuses the transfer, the money stays credited to
 * them and can be paid manually — nothing is ever lost by a failed payout.
 */

let monei = null;
const getMonei = () => {
  if (!monei) monei = new MoneiSDK({ apiKey: process.env.MONEI_SECRET_KEY });
  return monei;
};

/** Recognises the provider's limit refusals, which need a human, not a retry. */
const isLimitError = (message = "") =>
  /limit|exceed|insufficient|balance/i.test(message);

/**
 * @returns {{ paid: boolean, reason?: string, reference?: string, amount?: number }}
 */
async function payoutVendorForOrder(orderId) {
  const order = await Order.findById(orderId).select(
    "orderId vendorId vendorShare payoutStatus",
  );
  if (!order) return { paid: false, reason: "order not found" };

  // Idempotency: a webhook and the client's verify call both land here.
  if (order.payoutStatus === "paid") {
    return { paid: false, reason: "already paid out" };
  }

  const amount = Number(order.vendorShare) || 0;
  if (amount <= 0) return { paid: false, reason: "nothing to pay out" };

  const vendor = await Vendor.findById(order.vendorId).select(
    "accountNumber bankCode bankName businessName",
  );

  // No bank details is the common case today — most vendors have never
  // entered any. Their share stays in the wallet rather than failing the
  // payment, and they are paid once they add an account.
  if (!vendor?.accountNumber || !vendor?.bankCode) {
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          payoutStatus: "held",
          payoutError: "Vendor has no bank account on file",
        },
      },
    );
    return {
      paid: false,
      reason: "vendor has no bank account — held in wallet",
    };
  }

  if (!process.env.MONEI_TRANSACTION_PIN) {
    // Refused rather than attempted, so this surfaces as a clear configuration
    // problem instead of a confusing provider error.
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          payoutStatus: "held",
          payoutError: "MONEI_TRANSACTION_PIN is not configured",
        },
      },
    );
    return { paid: false, reason: "MONEI_TRANSACTION_PIN is not set" };
  }

  try {
    const result = await getMonei().payout.bankTransfer({
      amount,
      bank: vendor.bankCode,
      accountNumber: vendor.accountNumber,
      transactionPin: process.env.MONEI_TRANSACTION_PIN,
      reference: `PO-${order.orderId}`,
      narration: `Chowspace order ${order.orderId}`,
    });

    const data = result?.data || result;

    // The vendor's share has left our wallet, so take it off their balance —
    // otherwise the wallet would double-count money they already have.
    await Wallet.updateOne(
      { vendorId: order.vendorId },
      {
        $inc: { balance: -amount },
        $push: {
          transactions: {
            type: "debit",
            amount,
            description: `Payout for order ${order.orderId}`,
            date: new Date(),
          },
        },
      },
    );

    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          payoutStatus: "paid",
          payoutReference: data?.reference || null,
          payoutAt: new Date(),
          payoutError: null,
        },
      },
    );

    return { paid: true, reference: data?.reference, amount };
  } catch (err) {
    const message = err?.response?.data?.message || err.message;

    // A limit refusal is not transient — it needs the account upgrading or the
    // day to roll over — so it is recorded plainly rather than retried.
    const reason = isLimitError(message)
      ? `Monei limit reached: ${message}`
      : message;

    console.error(
      `Payout failed for order ${order.orderId} (₦${amount}): ${reason}`,
    );

    await Order.updateOne(
      { _id: order._id },
      { $set: { payoutStatus: "failed", payoutError: reason } },
    );

    // Deliberately not rethrown. The customer has paid and the vendor is
    // credited; a failed transfer is a payout problem to chase, not a reason
    // to fail the payment and have the provider retry the whole thing.
    return { paid: false, reason };
  }
}

module.exports = { payoutVendorForOrder, isLimitError };
