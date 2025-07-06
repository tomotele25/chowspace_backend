const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor",
    required: true,
  },
  items: [
    {
      menuItemId: mongoose.Schema.Types.ObjectId,
      name: String,
      quantity: Number,
      price: Number,
    },
  ],
  guestInfo: {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
  },
  deliveryMethod: {
    type: String,
    enum: ["walk-in", "delivery"],
    required: true,
  },

  totalAmount: { type: Number, required: true },
  status: {
    type: String,
    enum: ["pending", "completed", "cancelled"],
    default: "pending",
  },
  paymentStatus: {
    type: String,
    enum: ["unpaid", "pending", "paid"],
    default: "unpaid",
  },

  paymentReference: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Order", OrderSchema);
