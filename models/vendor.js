const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    businessName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      unique: true,
    },

    fullname: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    logo: {
      type: String,
      default: "",
    },
    contact: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      unique: true,
    },
    status: {
      type: String,
      enum: ["opened", "closed"],
      default: "closed",
    },

    accountNumber: {
      type: String,
      default: null,
    },
    bankName: {
      type: String,
      default: null,
    },
    subaccountId: {
      type: String,
      default: null,
    },
    deliveryDuration: {
      type: Number,
      required: false,
      default: null,
    },
    ratings: [
      {
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        stars: { type: Number, min: 1, max: 5 },
        comment: { type: String },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    averageRating: { type: Number, default: 0 },
    isPromoted: {
      type: Boolean,
      default: false,
    },
    promotionExpiresAt: {
      type: Date,
      default: null,
    },
    promotionTier: {
      type: String,
      enum: ["basic", "premium"],
      default: "basic",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vendor", vendorSchema);
