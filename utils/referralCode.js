const slugify = require("slugify");
const crypto = require("crypto");
const Influencer = require("../models/influencer");

/**
 * Influencer.code is unique and meant to be said out loud or typed into a
 * URL, so it has to collide-check the same way Vendor.slug does.
 *
 * Mirrors uniqueSlug in controller/vendor-controller.js exactly: slugify,
 * retry with -2, -3, ..., fall back to a random suffix if the name is wildly
 * popular. Kept as its own module (rather than importing the vendor one)
 * because it checks a different collection.
 */
async function uniqueReferralCode(name) {
  const base = slugify(name, { lower: true, strict: true }) || "influencer";
  if (!(await Influencer.exists({ code: base }))) return base;

  for (let i = 2; i < 50; i += 1) {
    const candidate = `${base}-${i}`;
    if (!(await Influencer.exists({ code: candidate }))) return candidate;
  }
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

module.exports = { uniqueReferralCode };
