const mongoose = require("mongoose");

const riderSchema = new mongoose.Schema(
  {
    fullname: {
      type: String,
      required: true,
      trim: true,
    },
    contact: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "inactive",
    },
    type: {
      type: String,
      enum: ["platform", "vendor"],
      default: "platform",
    },
    location: {
      type: String,
      required: true,
    },
    assignedOrders: [
      {
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
        vendorName: { type: String },
        from: { type: String },
        to: { type: String },
        assignedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Rider", riderSchema);
