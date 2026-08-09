/**
 * Puts every vendor on automatic open/close.
 *
 * Two groups need this, for different reasons:
 *
 *   - Vendors who never set hours. `status` defaults to "closed" and only
 *     changes if they find the dashboard toggle, so many have been invisible
 *     to customers since signup. With useAutoHours on, utils/Storehours.js
 *     substitutes the platform default of 09:00–21:00.
 *
 *   - Vendors who DID set hours but have useAutoHours false. getEffectiveStatus
 *     gates the whole schedule behind that flag, so their configured times were
 *     never applied. This makes them real.
 *
 * Also reports vendors whose configured hours run past the 22:00 platform hard
 * close, since those will now close earlier than they asked for.
 *
 * Usage:
 *   node scripts/enable-auto-hours.js            # dry run, writes nothing
 *   node scripts/enable-auto-hours.js --apply
 */
require("dotenv").config();
const mongoose = require("mongoose");

const Vendor = require("../models/vendor");
const {
  getEffectiveStatus,
  effectiveOpeningHours,
  HARD_CLOSE_HOUR,
  DEFAULT_OPEN,
  DEFAULT_CLOSE,
} = require("../utils/Storehours");

const APPLY = process.argv.includes("--apply");

const run = async () => {
  if (!process.env.DB_URL) {
    console.error("DB_URL is not set. Add it to .env before running.");
    process.exit(1);
  }

  await mongoose.connect(process.env.DB_URL);

  console.log(
    APPLY
      ? "APPLY MODE — vendors will be updated.\n"
      : "DRY RUN — nothing will be written. Re-run with --apply to execute.\n",
  );

  const vendors = await Vendor.find()
    .select(
      "businessName status useAutoHours openingHours timezone statusOverride",
    )
    .lean();

  const noHours = vendors.filter((v) => !v.openingHours?.length);
  const withHours = vendors.filter((v) => v.openingHours?.length);
  const toEnable = vendors.filter((v) => !v.useAutoHours);

  console.log(`Vendors                       : ${vendors.length}`);
  console.log(
    `  no hours set (get ${DEFAULT_OPEN}–${DEFAULT_CLOSE}) : ${noHours.length}`,
  );
  console.log(`  hours already set           : ${withHours.length}`);
  console.log(`  need useAutoHours turned on : ${toEnable.length}`);

  // What customers will actually see once this lands.
  const now = new Date();
  const flipping = vendors
    .map((v) => {
      const after = getEffectiveStatus({ ...v, useAutoHours: true }, now);
      return v.status !== after
        ? { name: v.businessName, from: v.status, to: after }
        : null;
    })
    .filter(Boolean);

  if (flipping.length) {
    console.log(
      `\nStatus changes taking effect right now (${flipping.length}):`,
    );
    flipping.forEach((f) =>
      console.log(`  ${f.from.padEnd(6)} -> ${f.to.padEnd(6)}  ${f.name}`),
    );
  }

  // Hours that run past the platform hard close get truncated.
  const truncated = withHours
    .map((v) => {
      const latest = v.openingHours
        .filter((d) => !d.closed && d.close)
        .reduce((max, d) => (d.close > max ? d.close : max), "00:00");
      return latest > `${String(HARD_CLOSE_HOUR).padStart(2, "0")}:00`
        ? { name: v.businessName, latest }
        : null;
    })
    .filter(Boolean);

  if (truncated.length) {
    console.log(
      `\nWill close at ${HARD_CLOSE_HOUR}:00 despite later configured hours (${truncated.length}) —`,
    );
    console.log("worth telling these vendors:");
    truncated.forEach((t) =>
      console.log(`  closes ${t.latest} -> 22:00   ${t.name}`),
    );
  }

  if (!APPLY) {
    console.log("\nDry run complete. Re-run with --apply to write.");
    await mongoose.disconnect();
    return;
  }

  if (toEnable.length === 0) {
    console.log("\nEvery vendor is already on auto-hours. Nothing to write.");
    await mongoose.disconnect();
    return;
  }

  const result = await Vendor.updateMany(
    { _id: { $in: toEnable.map((v) => v._id) } },
    { $set: { useAutoHours: true } },
  );
  console.log(`\nEnabled auto-hours on ${result.modifiedCount} vendors.`);

  const remaining = await Vendor.countDocuments({
    useAutoHours: { $ne: true },
  });
  console.log(
    remaining === 0
      ? "Every vendor is now on auto-hours."
      : `WARNING: ${remaining} vendors still off auto-hours.`,
  );

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
