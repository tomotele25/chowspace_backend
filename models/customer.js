const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      // ⚠️ No unique/sparse here — defined via schema.index() below
      // so Mongoose creates the index correctly
    },
    email: {
      type: String,
      default: null,
    },
    fullname: String,

    phone: {
      type: String,
      default: null,
    },

    order: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],

    // ── Birthday ──
    birthday: {
      month: { type: String, default: null },
      day: { type: Number, default: null },
    },
    hasBirthday: { type: Boolean, default: false },

    birthdayVendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
    },
  },
  { timestamps: true },
);

// Sparse unique index on user — enforces uniqueness only when user is set,
// allows unlimited documents where user is null (guests)
customerSchema.index({ user: 1 }, { unique: true, sparse: true });

// Auto-sync hasBirthday flag on save
customerSchema.pre("save", function (next) {
  this.hasBirthday = !!(this.birthday?.month && this.birthday?.day);
  next();
});

module.exports = mongoose.model("Customer", customerSchema);
