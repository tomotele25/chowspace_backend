const mongoose = require("mongoose");

const productSchema = mongoose.Schema(
  {
    productName: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    vendor: {
      type: mongoose.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    createdBy: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: true,
    },
    available: {
      type: Boolean,
      default: true,
    },
    position: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Every storefront product listing queries by vendor
// (getProductsByVendor / getProductsByVendorSlug) — without this it's a full
// collection scan on every menu page load.
productSchema.index({ vendor: 1 });

module.exports = mongoose.model("Product", productSchema);
