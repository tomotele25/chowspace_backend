const mongoose = require("mongoose");

const disputeSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    reason: {
      type: [String],
      required: true,
    },
    status: {
      type: String,
      enum: ["resolved", "rejected", "pending"],
      default: "pending",
    },
    message: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Dispute", disputeSchema);
