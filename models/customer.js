const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
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
    birthday: {
      month: { type: String, default: null },
      day: { type: Number, default: null },
    },
    hadhBirthday: { type: Boolean, default: false },
    hasBirthday: { type: Boolean, default: false },
    birthdayVendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
    },
  },
  { timestamps: true },
);

// No unique index on user anymore

// Not unique (duplicates can exist — see comment above), but every
// phone-keyed lookup (saveBirthday, wrapped-by-phone) was an unindexed scan
// without this.
customerSchema.index({ phone: 1 });

// Auto-sync hasBirthday flag on save
customerSchema.pre("save", function (next) {
  this.hasBirthday = !(!this.birthday?.month || !this.birthday?.day);
  this.hasBirthday = !!(this.birthday?.month && this.birthday?.day);
  next();
});

module.exports = mongoose.model("Customer", customerSchema);
