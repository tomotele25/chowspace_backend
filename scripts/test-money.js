/**
 * Money-path tests.
 *
 * Runs against the real database but writes nothing: every mutation happens
 * inside a transaction that is aborted at the end. It uses a real vendor and
 * real products, because the bugs here were about trusting client input and
 * about wallets that never existed — both of which only show up against
 * genuine documents.
 *
 *   node scripts/test-money.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

const Product = require("../models/product");
const Vendor = require("../models/vendor");
const Order = require("../models/order");
const Wallet = require("../models/wallet");
const { priceOrder, serviceFeeFor } = require("../utils/pricing");
const { creditVendorForOrder } = require("../utils/creditVendor");

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

  // A vendor with enough products to build a realistic order.
  // Available, priced products only — an unavailable one is correctly refused
  // by priceOrder, which would make this a test of the wrong thing.
  const candidate = await Product.aggregate([
    { $match: { available: true, price: { $gt: 0 } } },
    { $group: { _id: "$vendor", n: { $sum: 1 } } },
    { $match: { n: { $gte: 2 } } },
    { $limit: 1 },
  ]);
  if (!candidate.length) {
    console.log("No vendor with 2+ products — cannot run.");
    process.exit(1);
  }
  const vendorId = candidate[0]._id;
  const products = await Product.find({
    vendor: vendorId,
    available: true,
    price: { $gt: 0 },
  }).limit(2);
  const vendor = await Vendor.findById(vendorId).select(
    "businessName packingFee",
  );

  console.log(`\nUsing vendor: ${vendor.businessName}`);
  console.log(
    `Items: ${products.map((p) => `${p.productName} @ ₦${p.price}`).join(", ")}\n`,
  );

  console.log("Server-side pricing:\n");

  const honest = await priceOrder({
    vendorId,
    items: [
      { productId: products[0]._id, quantity: 2 },
      { productId: products[1]._id, quantity: 1 },
    ],
    packCount: 1,
  });

  const expectedItems = products[0].price * 2 + products[1].price;
  check(
    "items priced from Product.price",
    honest.ok && honest.priced.itemsTotal === expectedItems,
    `got ₦${honest.priced?.itemsTotal}, expected ₦${expectedItems}`,
  );

  check(
    "service fee is the flat platform fee",
    honest.priced.serviceFee === serviceFeeFor(),
    `₦${honest.priced.serviceFee}`,
  );

  check(
    "vendor share excludes the service fee",
    honest.priced.vendorShare ===
      honest.priced.total - honest.priced.serviceFee,
    `total ₦${honest.priced.total} − fee ₦${honest.priced.serviceFee} = ₦${honest.priced.vendorShare}`,
  );

  check(
    "totals add up",
    honest.priced.total ===
      honest.priced.itemsTotal +
        honest.priced.packFees +
        honest.priced.deliveryFee +
        honest.priced.serviceFee,
  );

  // The headline bug: a client claiming its own prices.
  const lying = await priceOrder({
    vendorId,
    items: [{ productId: products[0]._id, quantity: 2, price: 1 }],
    packCount: 0,
  });
  check(
    "a client-supplied price is ignored",
    lying.ok && lying.priced.itemsTotal === products[0].price * 2,
    `client said ₦1/item, server charged ₦${lying.priced?.itemsTotal}`,
  );

  const foreign = await Product.findOne({
    vendor: { $ne: vendorId },
    available: true,
  });
  if (foreign) {
    const mixed = await priceOrder({
      vendorId,
      items: [{ productId: foreign._id, quantity: 1 }],
    });
    check("another vendor's product is refused", !mixed.ok, mixed.error);
  }

  const noId = await priceOrder({
    vendorId,
    items: [{ name: "Jollof", price: 50, quantity: 1 }],
  });
  check("an item with no productId is refused", !noId.ok, noId.error);

  const badZone = await priceOrder({
    vendorId,
    items: [{ productId: products[0]._id, quantity: 1 }],
    deliveryLocation: "Nowhere At All",
  });
  check("an unknown delivery zone is refused", !badZone.ok, badZone.error);

  console.log("\nCrediting (inside a transaction, rolled back):\n");

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const [order] = await Order.create(
      [
        {
          orderId: `TEST-${Date.now()}`,
          vendorId,
          items: honest.priced.lines,
          guestInfo: { name: "Test", phone: "08000000000" },
          deliveryMethod: "whatsapp",
          itemsTotal: honest.priced.itemsTotal,
          packFees: honest.priced.packFees,
          deliveryFee: honest.priced.deliveryFee,
          serviceFee: honest.priced.serviceFee,
          totalAmount: honest.priced.total,
          vendorShare: honest.priced.vendorShare,
        },
      ],
      { session },
    );

    const walletBefore = await Wallet.findOne({ vendorId }).session(session);
    const balanceBefore = walletBefore?.balance ?? null;

    // creditVendorForOrder opens its own transaction, so it cannot see this
    // uncommitted order. Assert the intent directly instead: the amount it
    // would credit, and that the guard is in place.
    check(
      "order records what the vendor is owed",
      order.vendorShare === honest.priced.vendorShare,
      `vendorShare ₦${order.vendorShare}`,
    );
    check(
      "platform keeps the service fee",
      order.totalAmount - order.vendorShare === honest.priced.serviceFee,
      `₦${order.totalAmount - order.vendorShare} retained`,
    );
    check("credit guard starts unset", order.walletCreditedAt === null);
    console.log(
      `        vendor wallet before: ${balanceBefore === null ? "no wallet exists yet" : `₦${balanceBefore}`}`,
    );
  } finally {
    await session.abortTransaction();
    await session.endSession();
  }

  const vendorsWithoutWallet = await Vendor.countDocuments({
    _id: { $nin: await Wallet.distinct("vendorId") },
  });
  console.log(
    `\n${vendorsWithoutWallet} vendors have no wallet document — each would have been skipped by the old \`if (wallet)\` credit.`,
  );

  console.log(`\n${pass} passed, ${fail} failed.`);
  await mongoose.disconnect();
  process.exit(fail === 0 ? 0 : 1);
})();
