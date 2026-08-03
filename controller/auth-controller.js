require("dotenv").config();
const bcrypt = require("bcrypt");
const User = require("../models/user");
const jwt = require("jsonwebtoken");
const Vendor = require("../models/vendor");
const crypto = require("crypto");
const { sendSignupEmail, sendVendorVerificationEmail } = require("../mailer");

const signup = async (req, res) => {
  const { fullname, contact, email, password } = req.body;

  try {
    if (!fullname || !contact || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const newUser = new User({
      fullname,
      contact,
      email,
      password: hashedPassword,
    });

    await newUser.save();
    try {
      await sendSignupEmail(email, fullname);
    } catch (err) {
      console.error("Email failed:", err);
    }
    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: {
        id: newUser._id,
        fullname: newUser.fullname,
        email: newUser.email,
        contact: newUser.contact,
      },
    });
  } catch (error) {
    console.error("Signup error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required" });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid credentials" });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid credentials" });
  }

  // Vendors sign themselves up now, so the address has to be proven before
  // they get in. Only enforced for vendors — customers and the accounts that
  // predate self-signup are unaffected. The code lets the frontend offer a
  // resend button instead of a dead end.
  if (user.role === "vendor" && user.emailVerified === false) {
    return res.status(403).json({
      success: false,
      code: "EMAIL_NOT_VERIFIED",
      message: "Confirm your email address to log in. Check your inbox.",
    });
  }

  // Fetch vendor data if user is a vendor
  let vendorData = {};
  if (user.role === "vendor") {
    const vendor = await Vendor.findOne({ user: user._id });
    if (vendor) {
      vendorData = {
        vendorId: vendor._id,
        businessName: vendor.businessName,
        location: vendor.location,
        address: vendor.address,
        contact: vendor.contact,
        paymentPreference: vendor.paymentPreference,
      };
    }
  }

  const accessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "2d",
  });

  return res.status(200).json({
    success: true,
    accessToken,
    user: {
      id: user._id,
      fullname: user.fullname,
      email: user.email,
      role: user.role,
      ...vendorData,
    },
  });
};

/** Hash a raw token the same way createVendor stored it. */
const hashToken = (raw) =>
  crypto.createHash("sha256").update(String(raw)).digest("hex");

/**
 * GET /api/auth/verify-email?token=…
 *
 * Redirects rather than returning JSON — this URL is clicked from an email
 * client, so the destination has to be a page a human can read.
 */
const verifyEmail = async (req, res) => {
  const site = process.env.SITE_URL || "https://chowspace.ng";
  const { token } = req.query;

  try {
    if (!token) return res.redirect(`${site}/Login?verified=invalid`);

    const user = await User.findOne({
      emailVerifyToken: hashToken(token),
      emailVerifyExpires: { $gt: new Date() },
    }).select("+emailVerifyToken +emailVerifyExpires");

    if (!user) {
      // Either wrong, already used, or expired — all the same to the visitor,
      // and the resend flow covers every case.
      return res.redirect(`${site}/Login?verified=expired`);
    }

    user.emailVerified = true;
    user.emailVerifyToken = undefined;
    user.emailVerifyExpires = undefined;
    await user.save({ validateModifiedOnly: true });

    return res.redirect(`${site}/Login?verified=1`);
  } catch (err) {
    console.error("verifyEmail error:", err);
    return res.redirect(`${site}/Login?verified=error`);
  }
};

/**
 * POST /api/auth/resend-verification  { email }
 *
 * Always answers the same way, so this can't be used to discover which email
 * addresses have accounts.
 */
const resendVerification = async (req, res) => {
  const generic = {
    success: true,
    message: "If that address needs confirming, we've sent a new link.",
  };

  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const user = await User.findOne({ email, role: "vendor" });
    if (!user || user.emailVerified) return res.status(200).json(generic);

    const vendor = await Vendor.findOne({ user: user._id }).select("businessName");

    const rawToken = crypto.randomBytes(32).toString("hex");
    user.emailVerifyToken = hashToken(rawToken);
    user.emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save({ validateModifiedOnly: true });

    const link = `${process.env.API_PUBLIC_URL || "https://chowspace-backend.vercel.app"}/api/auth/verify-email?token=${rawToken}`;

    await sendVendorVerificationEmail(email, {
      businessName: vendor?.businessName || "your store",
      link,
    });

    return res.status(200).json(generic);
  } catch (err) {
    console.error("resendVerification error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Could not send the email. Try again shortly." });
  }
};

module.exports = { signup, login, verifyEmail, resendVerification };
