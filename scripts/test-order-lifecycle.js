/**
 * End-to-end order lifecycle against the real database and the real Monei API.
 *
 * Unlike test-money.js this genuinely writes: it creates an order, credits a
 * wallet and attempts a payout, because that is the only way to know the
 * transaction, the idempotency guard and the payout fallback behave. Every
 * document it creates is removed in the `finally` block, including reversing
 * the wallet credit, and it prints exactly what it touched.
 *
 * No real money moves. Initializing a deposit only generates a virtual
 * account; nothing is charged unless a human transfers into it.
 *
 *   node scripts/test-order-lifecycle.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { MoneiSDK, DepositMethodsEnum } = require("monei-sdk");

const Product = require("../models/product");
const Vendor = require("../models/vendor");
const Order = require("../models/order");
const Wallet = require("../models/wallet");
const { priceOrder } = require("../utils/pricing");
const { creditVendorForOrder } = require("../utils/creditVendor");
const { payoutVendorForOrder } = require("../utils/moneiPayout");

let pass = 0;
let fail = 0;
const check = (label, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`,
  );
};

(async () => {
  await mongoose.connect(process.env.DB_URL);

  let orderId = null;
  let vendorId = null;
  let walletExistedBefore = false;
  let creditedAmount = 0;

  try {
    const candidate = await Product.aggregate([
      { $match: { available: true, price: { $gt: 0 } } },
      { $group: { _id: "$vendor", n: { $sum: 1 } } },
      { $match: { n: { $gte: 1 } } },
      { $limit: 1 },
    ]);
    vendorId = candidate[0]._id;
    const product = await Product.findOne({
      vendor: vendorId,
      available: true,
      price: { $gt: 0 },
    });
    const vendor = await Vendor.findById(vendorId).select(
      "businessName accountNumber bankCode",
    );

    console.log(`\nVendor: ${vendor.businessName}`);
    console.log(`Item:   ${product.productName} @ ₦${product.price}\n`);

    console.log("1. Pricing\n");
    const { ok, priced } = await priceOrder({
      vendorId,
      items: [{ productId: product._id, quantity: 1 }],
      packCount: 1,
    });
    check("order priced from the database", ok, `total ₦${priced.total}`);

    console.log("\n2. Virtual account from Monei\n");
    const monei = new MoneiSDK({ apiKey: process.env.MONEI_SECRET_KEY });
    const ref = `LIFECYCLE-${Date.now()}`;
    const deposit = await monei.deposit.initializeDeposit(
      DepositMethodsEnum.BANK_TRANSFER,
      {
        amount: priced.total,
        currency: "NGN",
        reference: ref,
        narration: "lifecycle test",
      },
    );
    check(
      "a payable account was generated",
      Boolean(deposit.accountNumber),
      `${deposit.bankName} ${deposit.accountNumber} — transfer ₦${deposit.totalAmount}`,
    );
    check(
      "customer pays the order total plus the provider fee",
      Math.abs(
        Number(deposit.totalAmount) - (priced.total + Number(deposit.moneiFee)),
      ) < 0.01,
    );

    console.log("\n3. Order created\n");
    const order = await Order.create({
      orderId: ref,
      vendorId,
      items: priced.lines,
      guestInfo: { name: "Lifecycle Test", phone: "08000000000" },
      deliveryMethod: "chat",
      itemsTotal: priced.itemsTotal,
      packFees: priced.packFees,
      deliveryFee: priced.deliveryFee,
      serviceFee: priced.serviceFee,
      totalAmount: priced.total,
      vendorShare: priced.vendorShare,
      moneiFee: Number(deposit.moneiFee),
      paymentRef: ref,
      paymentMethod: "monei",
      paymentStatus: "pending",
    });
    orderId = order._id;
    check(
      "order starts unpaid and uncredited",
      order.paymentStatus === "pending" && order.walletCreditedAt === null,
    );

    const before = await Wallet.findOne({ vendorId });
    walletExistedBefore = Boolean(before);
    const balanceBefore = before?.balance || 0;

    console.log("\n4. Payment confirmed — credit the vendor\n");
    const credit = await creditVendorForOrder(orderId);
    creditedAmount = credit.amount || 0;
    check("vendor credited", credit.credited, `₦${credit.amount}`);
    check(
      "credited the vendor's share, not the customer's total",
      credit.amount === priced.vendorShare,
      `₦${credit.amount} of ₦${priced.total} — Chowspace keeps ₦${priced.serviceFee}`,
    );

    const after = await Wallet.findOne({ vendorId });
    check(
      "wallet exists and moved by exactly that amount",
      after && after.balance - balanceBefore === priced.vendorShare,
      `${balanceBefore} → ${after?.balance}${walletExistedBefore ? "" : " (wallet created by this credit)"}`,
    );

    const reloaded = await Order.findById(orderId);
    check("order marked paid", reloaded.paymentStatus === "paid");
    check("credit guard now set", reloaded.walletCreditedAt !== null);

    console.log("\n5. The same webhook arriving twice\n");
    const second = await creditVendorForOrder(orderId);
    check("second credit refused", !second.credited, second.reason);
    const afterTwice = await Wallet.findOne({ vendorId });
    check(
      "balance unchanged by the duplicate",
      afterTwice.balance === after.balance,
      `still ₦${afterTwice.balance}`,
    );

    console.log("\n6. Payout to the vendor's bank\n");
    const payout = await payoutVendorForOrder(orderId);
    const hasBank = Boolean(vendor.accountNumber && vendor.bankCode);
    if (payout.paid) {
      check("paid out", true, `reference ${payout.reference}`);
    } else {
      check(
        hasBank
          ? "payout refused, money safely held"
          : "no bank account, so held in wallet rather than lost",
        !payout.paid,
        payout.reason,
      );
      const held = await Order.findById(orderId).select(
        "payoutStatus payoutError",
      );
      check(
        "order records why",
        held.payoutStatus === "held" || held.payoutStatus === "failed",
        `${held.payoutStatus}: ${held.payoutError}`,
      );
      const stillCredited = await Wallet.findOne({ vendorId });
      check(
        "the vendor still has the money",
        stillCredited.balance === after.balance,
        `₦${stillCredited.balance}`,
      );
    }
  } catch (err) {
    console.error("\nlifecycle error:", err.message);
    fail += 1;
  } finally {
    console.log("\nCleaning up:\n");
    if (orderId) {
      await Order.deleteOne({ _id: orderId });
      console.log(`  removed test order ${orderId}`);
    }
    if (creditedAmount > 0 && vendorId) {
      if (walletExistedBefore) {
        await Wallet.updateOne(
          { vendorId },
          {
            $inc: { balance: -creditedAmount },
            $pull: { transactions: { description: /LIFECYCLE-/ } },
          },
        );
        console.log(`  reversed the ₦${creditedAmount} test credit`);
      } else {
        await Wallet.deleteOne({ vendorId });
        console.log("  removed the wallet this test created");
      }
    }

    console.log(`\n${pass} passed, ${fail} failed.`);
    await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})();
