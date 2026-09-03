require("dotenv").config();
const mongoose = require("mongoose");
const Order = require("../models/order");
const Vendor = require("../models/vendor");

const VENDOR_NAME_PATTERNS = [/olumanny/i, /mega\s*spice/i];
const TARGET_DATE = process.argv[2] || "2026-08-20"; // yesterday, YYYY-MM-DD
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

function dayRange(dateStr) {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(`${dateStr}T23:59:59.999`);
  return { start, end };
}

function customerKey(order) {
  if (order.customerId) return `uid:${order.customerId}`;
  const info = order.customerInfo || order.guestInfo || {};
  return `contact:${info.phone || info.email || "unknown"}`;
}

function findDuplicateGroups(orders) {
  const buckets = new Map();
  for (const order of orders) {
    const key = `${customerKey(order)}|${order.totalAmount}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(order);
  }

  const groups = [];
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    bucket.sort((a, b) => a.createdAt - b.createdAt);
    let cluster = [bucket[0]];
    for (let i = 1; i < bucket.length; i++) {
      const gap = bucket[i].createdAt - cluster[cluster.length - 1].createdAt;
      if (gap <= DUPLICATE_WINDOW_MS) {
        cluster.push(bucket[i]);
      } else {
        if (cluster.length > 1) groups.push(cluster);
        cluster = [bucket[i]];
      }
    }
    if (cluster.length > 1) groups.push(cluster);
  }
  return groups;
}

async function main() {
  await mongoose.connect(process.env.DB_URL, {
    serverSelectionTimeoutMS: 60000,
  });
  console.log(`Connected. Checking orders for ${TARGET_DATE}...\n`);

  const vendors = await Vendor.find({
    $or: VENDOR_NAME_PATTERNS.map((p) => ({ businessName: p })),
  }).select("_id businessName");

  if (vendors.length === 0) {
    console.log("No matching vendors found for Olumanny / Mega Spice.");
    await mongoose.disconnect();
    return;
  }

  const { start, end } = dayRange(TARGET_DATE);

  for (const vendor of vendors) {
    const orders = await Order.find({
      vendorId: vendor._id,
      createdAt: { $gte: start, $lte: end },
    })
      .sort({ createdAt: 1 })
      .lean();

    console.log(
      `\n=== ${vendor.businessName} (${vendor._id}) — ${orders.length} order(s) on ${TARGET_DATE} ===`
    );

    const dupGroups = findDuplicateGroups(orders);

    if (dupGroups.length === 0) {
      console.log("No likely duplicates found.");
      continue;
    }

    dupGroups.forEach((group, idx) => {
      console.log(`\n  Possible duplicate group ${idx + 1}:`);
      for (const o of group) {
        console.log(
          `    orderId=${o.orderId || "(none)"} _id=${o._id} createdAt=${o.createdAt.toISOString()} ` +
            `status=${o.status} paymentStatus=${o.paymentStatus} totalAmount=${o.totalAmount}`
        );
      }
    });
  }

  await mongoose.disconnect();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
