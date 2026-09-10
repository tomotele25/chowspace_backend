/**
 * Seeds the per-phone order counter the WhatsApp messaging feature reads.
 *
 * The trigger in createOrder classifies a customer as first-time vs returning
 * from `cust:orders:<phone>` in Redis. Without this backfill every existing
 * customer would look brand new on their next order and get the "thanks for
 * your first order" message. Run it once before setting WA_ENABLED=true.
 *
 * Idempotent: it SETs absolute counts, so re-running is harmless.
 *
 * Usage:
 *   node scripts/seed-wa-redis.js            # dry run, writes nothing
 *   node scripts/seed-wa-redis.js --apply
 */
require("dotenv").config();
const mongoose = require("mongoose");

const Order = require("../models/order");
const { getRedis } = require("../queues/redis");
const { normalizePhone } = require("../utils/phone");

const APPLY = process.argv.includes("--apply");

const run = async () => {
  if (!process.env.DB_URL) {
    console.error("DB_URL is not set. Add it to .env before running.");
    process.exit(1);
  }
  const redis = getRedis();
  if (!redis) {
    console.error(
      "UPSTASH_REDIS_REST_URL / _TOKEN not set. Add them to .env before running.",
    );
    process.exit(1);
  }

  await mongoose.connect(process.env.DB_URL);
  console.log(
    APPLY
      ? "APPLY MODE — Redis counters will be written.\n"
      : "DRY RUN — nothing will be written. Re-run with --apply.\n",
  );

  const counts = new Map(); // phone -> order count

  const cursor = Order.find({ status: { $ne: "cancelled" } })
    .select("customerInfo.phone guestInfo.phone")
    .lean()
    .cursor();

  let scanned = 0;
  for await (const o of cursor) {
    scanned++;
    const phone = normalizePhone(o.customerInfo?.phone || o.guestInfo?.phone);
    if (!phone) continue;
    counts.set(phone, (counts.get(phone) || 0) + 1);
  }

  console.log(
    `Scanned ${scanned} orders -> ${counts.size} distinct phone numbers.`,
  );

  if (!APPLY) {
    const sample = [...counts.entries()].slice(0, 10);
    console.log("Sample:", sample);
    await mongoose.disconnect();
    return;
  }

  let written = 0;
  const entries = [...counts.entries()];
  for (let i = 0; i < entries.length; i += 100) {
    const batch = entries.slice(i, i + 100);
    const pipe = redis.pipeline();
    for (const [phone, n] of batch) pipe.set(`cust:orders:${phone}`, n);
    await pipe.exec();
    written += batch.length;
    console.log(`  wrote ${written}/${entries.length}`);
  }

  console.log(`\nDone. ${written} counters set.`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
