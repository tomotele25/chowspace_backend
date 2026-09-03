/**
 * Populates displayRating / reviewCount / orders30d / ratingPercentile on
 * every vendor.
 *
 * The daily cron (controller/settings-controller.js recomputeAllVendorRatings)
 * keeps these fresh going forward, but new fields start empty — this backfills
 * them once so storefront cards render a real rating immediately after deploy.
 *
 * Usage:
 *   node scripts/backfill-ratings.js            # dry run, writes nothing
 *   node scripts/backfill-ratings.js --apply
 */
require("dotenv").config();
const mongoose = require("mongoose");

const Vendor = require("../models/vendor");
const Order = require("../models/order");
const {
  computeDisplayRating,
  orderVolumePercentiles,
} = require("../utils/rating");
const { recentOrderCountsByVendor } = require("../utils/orderStats");

const APPLY = process.argv.includes("--apply");
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const counts = await recentOrderCountsByVendor(Order, since);

  const vendors = await Vendor.find().select("businessName ratings").lean();
  const percentiles = orderVolumePercentiles(
    counts,
    vendors.map((v) => v._id),
  );
  console.log(`Vendors                    : ${vendors.length}`);
  console.log(
    `With orders in last 30 days : ${counts.size} (busiest: ${
      counts.size ? Math.max(...counts.values()) : 0
    })\n`,
  );

  const now = new Date();
  const ops = [];
  const preview = [];
  for (const vendor of vendors) {
    const id = String(vendor._id);
    const orders30d = counts.get(id) || 0;
    const ratingPercentile = percentiles.get(id) || 0;
    const displayRating = computeDisplayRating({
      ratings: vendor.ratings || [],
      popPercentile: ratingPercentile,
    });
    ops.push({
      updateOne: {
        filter: { _id: vendor._id },
        update: {
          $set: {
            orders30d,
            ratingPercentile,
            displayRating,
            reviewCount: (vendor.ratings || []).length,
            ratingUpdatedAt: now,
          },
        },
      },
    });
    preview.push({
      name: vendor.businessName,
      reviews: (vendor.ratings || []).length,
      orders30d,
      displayRating,
    });
  }

  preview
    .sort((a, b) => b.displayRating - a.displayRating)
    .forEach((p) =>
      console.log(
        `  ${String(p.displayRating).padEnd(4)}★  ${String(p.reviews).padStart(
          3,
        )} reviews  ${String(p.orders30d).padStart(4)} orders/30d   ${p.name}`,
      ),
    );

  if (!APPLY) {
    console.log("\nDry run complete. Re-run with --apply to write.");
    await mongoose.disconnect();
    return;
  }

  const result = await Vendor.bulkWrite(ops, { ordered: false });
  console.log(`\nUpdated ${result.modifiedCount ?? ops.length} vendors.`);
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
