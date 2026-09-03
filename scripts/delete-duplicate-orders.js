require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Order = require("../models/order");
const Vendor = require("../models/vendor");

const VENDOR_NAME_PATTERNS = [/olumanny/i, /mega\s*spicy/i];
const TARGET_DATE = process.argv[2] || "2026-08-20";
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

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
  console.log(`Connected. Deleting duplicate orders for ${TARGET_DATE}...\n`);

  const vendors = await Vendor.find({
    $or: VENDOR_NAME_PATTERNS.map((p) => ({ businessName: p })),
  }).select("_id businessName");

  const { start, end } = dayRange(TARGET_DATE);
  const toDelete = [];
  const backup = [];

  for (const vendor of vendors) {
    const orders = await Order.find({
      vendorId: vendor._id,
      createdAt: { $gte: start, $lte: end },
    })
      .sort({ createdAt: 1 })
      .lean();

    const dupGroups = findDuplicateGroups(orders);
    console.log(`${vendor.businessName}: ${dupGroups.length} duplicate cluster(s)`);

    for (const group of dupGroups) {
      const [keep, ...remove] = group; // earliest = original
      console.log(
        `  keep orderId=${keep.orderId} (${keep.createdAt.toISOString()}), delete ${remove.length} duplicate(s)`
      );
      for (const o of remove) {
        toDelete.push(o._id);
        backup.push(o);
      }
    }
  }

  if (toDelete.length === 0) {
    console.log("\nNothing to delete.");
    await mongoose.disconnect();
    return;
  }

  const backupDir = path.join(__dirname, "backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(
    backupDir,
    `duplicate-orders-${TARGET_DATE}-${Date.now()}.json`
  );
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`\nBacked up ${backup.length} orders to ${backupFile}`);

  const result = await Order.deleteMany({ _id: { $in: toDelete } });
  console.log(`Deleted ${result.deletedCount} duplicate orders.`);

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
