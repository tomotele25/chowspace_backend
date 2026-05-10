const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // null for guest customers
      sparse: true, // allows multiple docs with null, but unique when set
      unique: true,
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

    // ── Birthday (added for ChowSpace birthday treat feature) ──
    birthday: {
      month: { type: String, default: null }, // e.g. "March"
      day: { type: Number, default: null }, // e.g. 15
    },
    hasBirthday: { type: Boolean, default: false },

    // The vendor they first gave their birthday through
    birthdayVendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
    },
  },
  { timestamps: true },
);

// Auto-sync hasBirthday flag on save
customerSchema.pre("save", function (next) {
  this.hasBirthday = !!(this.birthday?.month && this.birthday?.day);
  next();
});

module.exports = mongoose.model("Customer", customerSchema);
