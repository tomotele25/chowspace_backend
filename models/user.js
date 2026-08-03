const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullname: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    phoneNumber: {
      type: String,
    },
    role: {
      type: String,
      enum: ["admin", "vendor", "manager", "customer", "rider"],
      default: "customer",
    },
    businessName: {
      type: String,
    },
    location: {
      type: String,
    },
    address: {
      type: String,
    },
    image: {
      type: String,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // ── Email confirmation ──
    // Vendors sign up themselves now, so the address has to be proven before
    // they can log in — it's the only way to reach them about verification.
    emailVerified: {
      type: Boolean,
      default: false,
    },
    // select:false so the token never rides along on an incidental read.
    emailVerifyToken: {
      type: String,
      select: false,
    },
    emailVerifyExpires: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);
