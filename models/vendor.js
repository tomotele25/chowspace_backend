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
    category: {
      type: String,
      enum: ["restaurant", "pharmacy", "mall", "drinks"],
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
    coverImages: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 2,
        message: "You can only have up to 2 cover images.",
      },
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
    inAppChat: {
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
    paymentPreference: {
      type: String,
      enum: ["paystack", "direct"],
      default: "paystack",
    },
    packOptions: [
      {
        name: { type: String, required: true },
        fee: { type: Number, required: true },
      },
    ],

    // ── Store hours ──
    // On by default: a vendor who never opens Settings should still trade.
    // With no openingHours set, utils/Storehours.js substitutes the platform
    // default of 09:00–21:00 rather than leaving the store shut forever.
    useAutoHours: {
      type: Boolean,
      default: true,
    },
    timezone: {
      type: String,
      default: "Africa/Lagos",
    },
    openingHours: [
      {
        day: {
          type: String,
          enum: [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
          ],
          required: true,
        },
        closed: { type: Boolean, default: false },
        // Not required — a closed day has no meaningful open/close time
        open: { type: String, default: null },
        close: { type: String, default: null },
      },
    ],

    // Set when a vendor manually flips their store from the dashboard.
    // Expires at the next scheduled open or close, so closing early once
    // doesn't silently disable their schedule for good.
    statusOverride: {
      status: { type: String, enum: ["opened", "closed"] },
      expiresAt: { type: Date },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Vendor", vendorSchema);
