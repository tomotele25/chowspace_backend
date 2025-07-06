const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    items: [{ name: String, price: Number, quantity: Number, image: String }],
    guestInfo: {
      name: String,
      phone: String,
      address: String,
    },
    deliveryMethod: String,
    note: String,
    totalAmount: Number,
    status: { type: String, default: "pending" },
    paymentStatus: { type: String, default: "pending" },
    paymentRef: { type: String },
    paymentReference: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
