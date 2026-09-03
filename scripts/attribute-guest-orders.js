/**
 * Links past guest orders to customer accounts so they show up in order
 * history and Wrapped.
 *
 * A guest order (customerId null, guestInfo populated) is attributed to a
 * customer User when:
 *   - guestInfo.email matches the user's email (case-insensitive), OR
 *   - guestInfo.phone matches the user's phoneNumber (digits only, with the
 *     usual 0<->234 Nigerian prefix variants)
 *
 * Matches that resolve to more than one user are skipped. Checkout now sends
 * customerId for logged-in orders, so this is a one-time cleanup of history.
 *
 * Usage:
 *   node scripts/attribute-guest-orders.js            # dry run
 *   node scripts/attribute-guest-orders.js --apply
 *   node scripts/attribute-guest-orders.js --apply --since=2026-01-01
 */
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/user");
const Order = require("../models/order");

const APPLY = process.argv.includes("--apply");
const sinceArg = (process.argv.find((a) => a.startsWith("--since=")) || "").split(
  "=",
)[1];
const SINCE = sinceArg ? new Date(sinceArg) : new Date(2026, 0, 1);

const digits = (s) => String(s || "").replace(/\D/g, "");
const phoneVariants = (raw) => {
  const d = digits(raw);
  if (!d) return [];
  const out = new Set([d]);
  if (d.startsWith("234")) out.add("0" + d.slice(3));
  else if (d.startsWith("0")) out.add("234" + d.slice(1));
  if (d.length === 10) {
    out.add("0" + d);
    out.add("234" + d);
  }
  return [...out];
};

const run = async () => {
  if (!process.env.DB_URL) {
    console.error("DB_URL is not set.");
    process.exit(1);
  }
  await mongoose.connect(process.env.DB_URL);
  console.log(
    APPLY ? "APPLY MODE\n" : "DRY RUN — nothing will be written.\n",
    `Orders since ${SINCE.toISOString().slice(0, 10)}\n`,
  );

  const users = await User.find({ role: "customer" })
    .select("email phoneNumber fullname")
    .lean();

  const byEmail = new Map();
  const byPhone = new Map();
  for (const u of users) {
    if (u.email) {
      const k = u.email.trim().toLowerCase();
      byEmail.set(k, byEmail.has(k) ? null : u._id); // null = ambiguous
    }
    for (const p of phoneVariants(u.phoneNumber)) {
      byPhone.set(p, byPhone.has(p) ? null : u._id);
    }
  }
  console.log(
    `Customers: ${users.length}  (with email: ${
      users.filter((u) => u.email).length
    }, with phone: ${users.filter((u) => digits(u.phoneNumber)).length})`,
  );

  const orders = await Order.find({
    customerId: null,
    guestInfo: { $ne: null },
    createdAt: { $gte: SINCE },
  })
    .select("guestInfo createdAt")
    .lean();

  const ops = [];
  let byEmailHits = 0;
  let byPhoneHits = 0;
  let ambiguous = 0;
  for (const o of orders) {
    const email = o.guestInfo?.email?.trim().toLowerCase();
    let uid = email ? byEmail.get(email) : undefined;
    let via = "email";
    if (uid === undefined || uid === null) {
      for (const p of phoneVariants(o.guestInfo?.phone)) {
        const hit = byPhone.get(p);
        if (hit) {
          uid = hit;
          via = "phone";
          break;
        }
        if (hit === null) ambiguous += 1;
      }
    }
    if (!uid) continue;
    if (via === "email") byEmailHits += 1;
    else byPhoneHits += 1;
    ops.push({
      updateOne: {
        filter: { _id: o._id },
        update: { $set: { customerId: uid } },
      },
    });
  }

  console.log(`\nGuest orders scanned : ${orders.length}`);
  console.log(`Matched by email     : ${byEmailHits}`);
  console.log(`Matched by phone     : ${byPhoneHits}`);
  console.log(`Ambiguous skips      : ${ambiguous}`);
  console.log(`Total to attribute   : ${ops.length}`);

  if (!APPLY) {
    console.log("\nDry run complete. Re-run with --apply to write.");
    await mongoose.disconnect();
    return;
  }
  if (ops.length) {
    const r = await Order.bulkWrite(ops, { ordered: false });
    console.log(`\nAttributed ${r.modifiedCount ?? ops.length} orders.`);
  }
  await mongoose.disconnect();
};

run().catch(async (e) => {
  console.error("Failed:", e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
