const mongoose = require("mongoose");

const vendorLocationSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

vendorLocationSchema.index({ vendorId: 1, location: 1 }, { unique: true });

module.exports = mongoose.model("VendorLocation", vendorLocationSchema);
