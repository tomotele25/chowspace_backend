/**
 * Grandfathers the vendors that predate self-signup.
 *
 * They were created by an admin, so they never confirmed an email and never
 * uploaded business documents. Both are marked done — you agreed existing
 * vendors are exempt from the document requirement.
 *
 * They are NOT exempt from the storefront checklist. A vendor with fewer than
 * 7 products or no logo becomes hidden from customers until they finish, which
 * is the point: those storefronts are not ready to be seen.
 *
 * Prints exactly who goes dark and why, so they can be contacted first.
 *
 * Usage:
 *   node scripts/grandfather-vendors.js            # dry run
 *   node scripts/grandfather-vendors.js --apply
 */
require("dotenv").config();
const mongoose = require("mongoose");

const Vendor = require("../models/vendor");
const User = require("../models/user");
const Product = require("../models/product");
const {
  MIN_PRODUCTS,
  isPubliclyVisible,
  productCountsByVendor,
} = require("../utils/vendorVisibility");

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
    .select("businessName logo verificationStatus user email")
    .lean();
  const counts = await productCountsByVendor(
    Product,
    vendors.map((v) => v._id),
  );

  const graded = vendors.map((v) => {
    const productCount = counts.get(String(v._id)) || 0;
    const missing = [];
    if (productCount < MIN_PRODUCTS) missing.push(`${productCount}/${MIN_PRODUCTS} products`);
    if (!v.logo) missing.push("no logo");
    return {
      ...v,
      productCount,
      missing,
      live: isPubliclyVisible({ ...v, verificationStatus: "approved" }, productCount),
    };
  });

  const live = graded.filter((v) => v.live);
  const hidden = graded.filter((v) => !v.live);

  console.log(`Existing vendors : ${vendors.length}`);
  console.log(`  stay visible   : ${live.length}`);
  console.log(`  become HIDDEN  : ${hidden.length}`);

  if (hidden.length) {
    console.log(`\nHidden until they finish — worth contacting:`);
    hidden
      .sort((a, b) => b.productCount - a.productCount)
      .forEach((v) =>
        console.log(`  ${v.missing.join(", ").padEnd(28)} ${v.businessName}`),
      );

    const stocked = hidden.filter((v) => v.productCount >= MIN_PRODUCTS);
    if (stocked.length) {
      console.log(
        `\n  ${stocked.length} of these are stocked businesses hidden only for a missing logo:`,
      );
      stocked.forEach((v) =>
        console.log(`    ${v.businessName} (${v.productCount} products)`),
      );
    }
  }

  if (!APPLY) {
    console.log("\nDry run complete. Re-run with --apply to write.");
    await mongoose.disconnect();
    return;
  }

  const vendorResult = await Vendor.updateMany(
    { verificationStatus: { $ne: "approved" } },
    { $set: { verificationStatus: "approved", reviewedAt: new Date() } },
  );
  console.log(`\nMarked ${vendorResult.modifiedCount} vendors as verified.`);

  const userResult = await User.updateMany(
    { _id: { $in: vendors.map((v) => v.user) }, emailVerified: { $ne: true } },
    { $set: { emailVerified: true } },
  );
  console.log(`Marked ${userResult.modifiedCount} vendor logins as email-confirmed.`);

  const stillPending = await Vendor.countDocuments({
    verificationStatus: { $ne: "approved" },
  });
  console.log(
    stillPending === 0
      ? "Every existing vendor is grandfathered."
      : `WARNING: ${stillPending} vendors still not approved.`,
  );

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
