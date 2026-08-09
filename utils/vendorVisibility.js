/**
 * Decides whether a vendor is visible to customers.
 *
 * Two tiers have to pass:
 *   Tier 1 — storefront: enough products to be worth visiting, and a logo, so
 *            the homepage card and storefront don't render broken.
 *   Tier 2 — documents: CAC, ID and proof of address, approved by an admin.
 *
 * Like getEffectiveStatus in Storehours.js, this is computed rather than
 * stored, so there is exactly one definition of "live" and moving the product
 * threshold is a one-line change instead of a migration.
 *
 * Not part of the checklist, deliberately: bank details (39 of 41 existing
 * vendors have none) and cover images (40 of 41). Requiring either would hide
 * essentially the whole platform, and since checkout runs over WhatsApp those
 * vendors are paid outside Chowspace anyway.
 */

const MIN_PRODUCTS = 7;

/** Tier 2 — has an admin approved this vendor's documents? */
const documentsApproved = (vendor) => vendor?.verificationStatus === "approved";

/** Tier 1 — is the storefront presentable? */
const storefrontReady = (vendor, productCount) =>
  Number(productCount) >= MIN_PRODUCTS && Boolean(vendor?.logo);

/**
 * @param {object} vendor
 * @param {number} productCount - resolved by the caller; list endpoints should
 *   fetch all counts in one aggregate rather than querying per vendor.
 * @returns {boolean}
 */
const isPubliclyVisible = (vendor, productCount) =>
  documentsApproved(vendor) && storefrontReady(vendor, productCount);

/**
 * The same requirements, itemised, so the vendor dashboard and the API describe
 * progress in identical terms — a vendor should never be told "you're live"
 * by one screen and "3 products to go" by another.
 *
 * @returns {{ live: boolean, items: Array<{key, label, done, detail}> }}
 */
const verificationChecklist = (vendor, productCount) => {
  const count = Number(productCount) || 0;
  const status = vendor?.verificationStatus || "awaiting_documents";

  const documentLabels = {
    awaiting_documents: "Upload your CAC, ID and proof of address",
    under_review: "Documents submitted — awaiting review",
    approved: "Documents approved",
    rejected: vendor?.reviewNote
      ? `Rejected: ${vendor.reviewNote}`
      : "Documents were rejected — please re-upload",
  };

  const items = [
    {
      key: "products",
      label: `Add at least ${MIN_PRODUCTS} products`,
      done: count >= MIN_PRODUCTS,
      detail: `${count} of ${MIN_PRODUCTS}`,
    },
    {
      key: "logo",
      label: "Upload your business logo",
      done: Boolean(vendor?.logo),
      detail: vendor?.logo ? "Uploaded" : "Not uploaded",
    },
    {
      key: "documents",
      label: "Verify your business",
      done: status === "approved",
      detail: documentLabels[status],
    },
  ];

  return { live: isPubliclyVisible(vendor, count), items };
};

/** Product counts for many vendors in one query, keyed by vendor id string. */
const productCountsByVendor = async (Product, vendorIds) => {
  const match = vendorIds?.length ? { vendor: { $in: vendorIds } } : {};
  const rows = await Product.aggregate([
    { $match: match },
    { $group: { _id: "$vendor", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
};

module.exports = {
  MIN_PRODUCTS,
  documentsApproved,
  storefrontReady,
  isPubliclyVisible,
  verificationChecklist,
  productCountsByVendor,
};
