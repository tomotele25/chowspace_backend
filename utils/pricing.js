const Product = require("../models/product");
const Vendor = require("../models/vendor");
const VendorLocation = require("../models/vendorLocation");

/**
 * What an order costs, decided by the server.
 *
 * Every amount used to come from the browser: `totalAmount`, `deliveryFee` and
 * `packFees` were stored exactly as posted and never checked, so a crafted
 * request could pay ₦100 for a ₦20,000 cart. Prices are now looked up from the
 * documents that own them — Product.price, VendorLocation.price and
 * Vendor.packingFee — and the client's numbers are treated as a claim to be
 * verified rather than a fact.
 *
 * One module so the checkout total, the Monei charge and the wallet credit can
 * never disagree with each other.
 */

/**
 * Chowspace's revenue is a flat fee per order, added to the customer's bill as
 * the "Service Fee" — not a percentage of the food. It rose from ₦60 to ₦100
 * on 19 July 2026, and historical orders must keep the rate they were placed
 * under, which is why this takes a date.
 *
 * The same two constants exist in the admin analytics page. This is the copy
 * that decides what is charged and what a vendor is paid.
 */
const SERVICE_FEE_BEFORE = 60;
const SERVICE_FEE_AFTER = 100;
const SERVICE_FEE_CHANGE_DATE = new Date(2026, 6, 19, 0, 0, 0, 0);

const serviceFeeFor = (at = new Date()) =>
  new Date(at) >= SERVICE_FEE_CHANGE_DATE
    ? SERVICE_FEE_AFTER
    : SERVICE_FEE_BEFORE;

/** Vendors set this per store; 300 is the figure checkout has always defaulted to. */
const DEFAULT_PACKING_FEE = 300;

/**
 * Reprices an order from the database.
 *
 * @param {object}  input
 * @param {string}  input.vendorId
 * @param {Array}   input.items            [{ productId, quantity }] — name and
 *                                         price from the client are ignored
 * @param {string}  [input.deliveryLocation]  matched against the vendor's zones
 * @param {number}  [input.packCount]      number of packs, for the packing fee
 * @param {Date}    [input.at]             for the service-fee rate
 *
 * @returns {{ ok: boolean, error?: string, priced?: object }}
 */
async function priceOrder({
  vendorId,
  items = [],
  deliveryLocation,
  packCount = 0,
  at = new Date(),
}) {
  if (!vendorId) return { ok: false, error: "Missing vendor" };
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Order has no items" };
  }

  const ids = items.map((i) => i.productId).filter(Boolean);
  if (ids.length !== items.length) {
    // Older clients posted items with no productId. Without one there is
    // nothing to price against, and accepting the client's figure is the bug
    // this module exists to close.
    return { ok: false, error: "Every item must carry a productId" };
  }

  const [products, vendor] = await Promise.all([
    Product.find({ _id: { $in: ids }, vendor: vendorId }).select(
      "price productName available",
    ),
    Vendor.findById(vendorId).select("packingFee"),
  ]);

  if (!vendor) return { ok: false, error: "Vendor not found" };

  const byId = new Map(products.map((p) => [String(p._id), p]));

  const lines = [];
  for (const item of items) {
    const product = byId.get(String(item.productId));
    // A product that belongs to a different vendor simply isn't found here,
    // so this also stops an order mixing in another store's items.
    if (!product) {
      return { ok: false, error: `That item is no longer available` };
    }
    if (product.available === false) {
      return { ok: false, error: `${product.productName} is unavailable` };
    }

    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    lines.push({
      productId: product._id,
      name: product.productName,
      price: product.price,
      quantity,
      lineTotal: product.price * quantity,
    });
  }

  const itemsTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

  let deliveryFee = 0;
  if (deliveryLocation) {
    const zone = await VendorLocation.findOne({
      vendorId,
      location: deliveryLocation,
    }).select("price");
    if (!zone) return { ok: false, error: "We don't deliver to that area" };
    deliveryFee = Number(zone.price) || 0;
  }

  const packingFee = Number(vendor.packingFee) || DEFAULT_PACKING_FEE;
  const packFees = Math.max(0, Math.floor(Number(packCount) || 0)) * packingFee;

  const serviceFee = serviceFeeFor(at);

  return {
    ok: true,
    priced: {
      lines,
      itemsTotal,
      packFees,
      deliveryFee,
      serviceFee,
      // What the customer pays.
      total: itemsTotal + packFees + deliveryFee + serviceFee,
      // What the vendor is owed: everything except our fee. Delivery and
      // packing belong to the vendor, who pays the rider and buys the packs.
      vendorShare: itemsTotal + packFees + deliveryFee,
    },
  };
}

module.exports = {
  SERVICE_FEE_BEFORE,
  SERVICE_FEE_AFTER,
  SERVICE_FEE_CHANGE_DATE,
  DEFAULT_PACKING_FEE,
  serviceFeeFor,
  priceOrder,
};
