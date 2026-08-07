const Vendor = require("../models/vendor");
const User = require("../models/user");
const bcrypt = require("bcrypt");
const slugify = require("slugify");
const Manager = require("../models/manager");
const Wallet = require("../models/wallet");
const axios = require("axios");
const Order = require("../models/order");
const cron = require("node-cron");
const crypto = require("crypto");
const Product = require("../models/product");
const {
  getEffectiveStatus,
  nextScheduleBoundary,
} = require("../utils/Storehours");
const {
  isPubliclyVisible,
  productCountsByVendor,
} = require("../utils/vendorVisibility");
const { enqueueEmail } = require("../queues/email");

const BANK_CODES = {
  "Access Bank": "044",
  EcoBank: "050",
  "Fidelity Bank": "070",
  "First Bank": "011",
  "Guaranty Trust Bank": "058",
  "Kuda Microfinance Bank": "50211",
  "Moniepoint MFB": "50515",
  "Opay Digital Services Limited (OPay)": "999991",
  Paycom: "999991",
  Palmpay: "999992",
  "Stanbic IBTC Bank": "221",
  UBA: "033",
  "Union Bank": "032",
  "Zenith Bank": "057",
};

const getBankCode = (bankName) => {
  return BANK_CODES[bankName] || null;
};

/** Vendor.slug is unique, so two "Mama's Kitchen" signups must not collide. */
const uniqueSlug = async (businessName) => {
  const base = slugify(businessName, { lower: true, strict: true }) || "vendor";
  if (!(await Vendor.exists({ slug: base }))) return base;

  for (let i = 2; i < 50; i += 1) {
    const candidate = `${base}-${i}`;
    if (!(await Vendor.exists({ slug: candidate }))) return candidate;
  }
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
};

/**
 * Public vendor signup.
 *
 * This route was already unauthenticated before self-signup existed — the
 * admin dashboard was simply its only caller. Anyone who found it could create
 * a vendor that appeared on the homepage immediately, because nothing filtered
 * the vendor list. The verification gate below is what actually closes that:
 * a new vendor is invisible to customers until an admin approves their
 * documents AND their storefront is complete.
 */
const createVendor = async (req, res) => {
  const {
    password,
    fullname,
    businessName,
    contact,
    logo,
    location,
    address,
    category,
    email,
    paymentPreference,
    paymentMethods,
  } = req.body;
  try {
    if (
      !email ||
      !password ||
      !fullname ||
      !businessName ||
      !contact ||
      !location ||
      !address ||
      !category
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    if (String(password).length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    const normalisedEmail = String(email).trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalisedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const methods =
      Array.isArray(paymentMethods) && paymentMethods.length
        ? paymentMethods.filter((m) =>
            ["whatsapp", "paystack", "monei"].includes(m),
          )
        : ["whatsapp"];

    if (methods.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Choose at least one payment method",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Raw token goes in the email; only its hash is stored, so a database leak
    // doesn't hand out working confirmation links.
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const newUser = await User.create({
      fullname,
      email: normalisedEmail,
      password: hashedPassword,
      phoneNumber: contact,
      role: "vendor",
      emailVerified: false,
      emailVerifyToken: tokenHash,
      emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    let newVendor;
    try {
      newVendor = await Vendor.create({
        user: newUser._id,
        slug: await uniqueSlug(businessName),
        email: normalisedEmail,
        fullname,
        contact,
        location,
        logo,
        address,
        category,
        businessName,
        password: hashedPassword,
        paymentPreference: paymentPreference || "direct",
        paymentMethods: methods,
        verificationStatus: "awaiting_documents",
      });
    } catch (err) {
      // Don't leave an orphan User behind if the Vendor fails validation —
      // the email would be taken and the vendor could never sign up again.
      await User.findByIdAndDelete(newUser._id);
      throw err;
    }

    const link = `${process.env.API_PUBLIC_URL || "https://chowspace-backend.vercel.app"}/api/auth/verify-email?token=${rawToken}`;

    // Queued rather than awaited, so signup no longer blocks on an SMTP
    // handshake — and a transient SMTP failure is retried instead of losing
    // the one email that lets this vendor log in.
    //
    // `sent` is true whether the mail was queued or sent inline, so a false
    // still means nothing went out by any route and the message below stays
    // accurate.
    const { sent: emailSent } = await enqueueEmail({
      template: "vendor-verification",
      to: normalisedEmail,
      data: { businessName: newVendor.businessName, link },
    });

    res.status(201).json({
      success: true,
      emailSent,
      message: emailSent
        ? "Account created. Check your email to confirm your address."
        : "Account created, but we couldn't send the confirmation email. Use the resend option.",
      user: {
        fullname: newVendor.fullname,
        email: newVendor.email,
        contact: newVendor.contact,
        role: "vendor",
        location: newVendor.location,
        logo: newVendor.logo,
        address: newVendor.address,
        category: newVendor.category,
        businessName: newVendor.businessName,
        slug: newVendor.slug,
        paymentMethods: newVendor.paymentMethods,
        userId: newUser._id,
      },
    });
  } catch (error) {
    console.error("Error creating vendor:", error);
    res.status(500).json({
      success: false,
      message: "Could not create the vendor",
    });
  }
};

// The stored `status` field is only refreshed by the hourly cron, so it lags
// — and the cron may not run at all on Vercel's Hobby tier, which caps crons
// at one a day. getEffectiveStatus is pure and does no I/O, so computing it
// per request is free and makes opening at 9am exact.
const STATUS_FIELDS =
  "status openingHours timezone useAutoHours statusOverride";

// Needed by isPubliclyVisible alongside a product count.
const VISIBILITY_FIELDS = "verificationStatus logo";

/**
 * What a vendor looks like to the public.
 *
 * An allowlist rather than a blocklist, because a blocklist forgets: the two
 * listing queries below carried `accountNumber bankName subaccountId` to
 * anyone loading the homepage, and `getVendorBySlug` had no projection at all
 * — it returned the whole document, bcrypt password hash included.
 *
 * Anything added to the Vendor schema is private until it is named here.
 */
const PUBLIC_VENDOR_FIELDS = [
  "businessName",
  "slug",
  "logo",
  "coverImages",
  "location",
  "address",
  "category",
  "contact", // customers reach the vendor on WhatsApp from checkout
  "averageRating",
  "deliveryDuration",
  "paymentMethods",
  "paymentPreference",
  "isPromoted",
  "promotionExpiresAt",
  "createdAt",
  STATUS_FIELDS,
  VISIBILITY_FIELDS,
].join(" ");

const withLiveStatus = (vendor, at) => ({
  ...(vendor.toObject ? vendor.toObject() : vendor),
  status: getEffectiveStatus(vendor, at),
});

const getAllVendor = async (req, res) => {
  try {
    const now = new Date();
    const promotedVendors = await Vendor.find(
      {
        isPromoted: true,
        promotionExpiresAt: { $gt: now },
      },
      PUBLIC_VENDOR_FIELDS,
    ).sort({ promotionExpiresAt: 1 });
    const regularVendors = await Vendor.find(
      {
        $or: [
          { isPromoted: { $ne: true } },
          { promotionExpiresAt: { $lte: now } },
        ],
      },
      PUBLIC_VENDOR_FIELDS,
    );

    const all = [...promotedVendors, ...regularVendors];

    // One aggregate for every product count rather than a query per vendor.
    const counts = await productCountsByVendor(
      Product,
      all.map((v) => v._id),
    );

    // Hide vendors who haven't finished verification or whose storefront is
    // incomplete. This is the filter that makes public signup safe — without
    // it, anyone creating an account lands straight on the homepage.
    const vendors = all
      .filter((v) => isPubliclyVisible(v, counts.get(String(v._id)) || 0))
      .map((v) => withLiveStatus(v, now));

    // An empty list is a valid answer, not an error. Returning 404 made "no
    // vendors are visible right now" indistinguishable from "the API is
    // broken", so the homepage showed a failure state either way — and after
    // the visibility gate landed, that is exactly what every vendor without
    // seven products and a logo would have caused.
    return res.status(200).json({
      success: true,
      message: vendors.length
        ? "Vendors successfully found"
        : "No vendors are visible right now",
      vendors,
    });
  } catch (error) {
    console.error("Error fetching vendors:", error.message);
    return res.status(500).json({
      success: false,
      message: "Could not load vendors",
    });
  }
};

const getVendorBySlug = async (req, res) => {
  try {
    // Had no projection at all, so this public endpoint returned the entire
    // Vendor document — bcrypt password hash, bank account and subaccount id
    // included — to anyone who knew a storefront URL.
    const vendor = await Vendor.findOne(
      { slug: req.params.slug },
      PUBLIC_VENDOR_FIELDS,
    );
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // A vendor still in verification, or with an unfinished storefront, is
    // indistinguishable from one that doesn't exist. Same 404 either way, so
    // the slug can't be used to enumerate pending signups.
    const productCount = await Product.countDocuments({ vendor: vendor._id });
    if (!isPubliclyVisible(vendor, productCount)) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    res.status(200).json({ success: true, vendor: withLiveStatus(vendor) });
  } catch (err) {
    console.error("Error fetching vendor by slug:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const getVendorStatus = async (req, res) => {
  try {
    const user = req.user;
    let vendorId;
    if (req.params.vendorId) {
      vendorId = req.params.vendorId;
    } else if (user.role === "vendor") {
      vendorId = user._id;
    } else if (user.role === "manager") {
      if (!user.vendorId) {
        return res.status(404).json({
          success: false,
          message: "Manager is not linked to a vendor",
        });
      }
      vendorId = user.vendorId;
    } else {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized role" });
    }
    const vendor = await Vendor.findById(vendorId).select(STATUS_FIELDS);
    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }
    res.status(200).json({ success: true, status: getEffectiveStatus(vendor) });
  } catch (err) {
    console.error("Error fetching vendor status:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getVendorStatusById = async (req, res) => {
  try {
    const vendorId = req.params.vendorId;
    if (!vendorId) {
      return res
        .status(400)
        .json({ success: false, message: "Vendor ID is required" });
    }
    const vendor = await Vendor.findById(vendorId).select(STATUS_FIELDS);
    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }
    res.status(200).json({ success: true, status: getEffectiveStatus(vendor) });
  } catch (error) {
    console.error("Error fetching vendor status:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getTotalCountOfVendor = async (req, res) => {
  try {
    const totalVendor = await User.countDocuments({ role: "vendor" });
    if (!totalVendor && totalVendor !== 0) {
      return res
        .status(400)
        .json({ success: false, message: "Vendors not found" });
    }
    res.status(200).json({
      success: true,
      message: "Vendor count fetched successfully",
      totalVendor,
    });
  } catch (error) {
    console.error("Unable to fetch total vendor", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const toggleVendorStatus = async (req, res) => {
  const { status } = req.body;
  if (!["opened", "closed"].includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid status" });
  }
  try {
    let vendorId;
    if (req.user.role === "manager") {
      // Find vendor linked to manager
      const managerDoc = await Manager.findOne({ user: req.user._id }).populate(
        "vendor",
      );
      if (!managerDoc || !managerDoc.vendor) {
        return res
          .status(404)
          .json({ success: false, message: "Vendor not found for manager" });
      }
      vendorId = managerDoc.vendor._id;
    } else if (req.user.role === "vendor") {
      // Find vendor linked to vendor user
      const vendorDoc = await Vendor.findOne({ user: req.user._id });
      if (!vendorDoc) {
        return res
          .status(404)
          .json({ success: false, message: "Vendor not found" });
      }
      vendorId = vendorDoc._id;
    } else {
      return res.status(403).json({
        success: false,
        message:
          "Unauthorized: Only managers or vendors can perform this action",
      });
    }
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }

    // Every vendor now runs on a schedule, so a bare status write would just
    // be reverted by the next cron. Record it as an override instead, expiring
    // at the next scheduled open/close — closing early tonight shouldn't stop
    // the store opening tomorrow morning.
    const expiresAt = nextScheduleBoundary(vendor);

    vendor.status = status;
    vendor.statusOverride = expiresAt ? { status, expiresAt } : undefined;
    await vendor.save({ validateModifiedOnly: true });

    res.status(200).json({
      success: true,
      message: `Store is now ${status}`,
      vendor,
      // Lets the dashboard say "Closed until 9:00 AM" rather than implying
      // the change is permanent.
      overrideUntil: expiresAt || null,
    });
  } catch (err) {
    console.error("Toggle error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * PUT /api/vendor/profile/update
 *
 * Expects multipart/form-data. File fields (via upload.fields, see route):
 *   - logo: single file
 *   - coverImages: up to 2 files
 *
 * To let a vendor keep some existing cover images while adding/replacing
 * others, the frontend can send a JSON-stringified array of URLs to keep
 * under `existingCoverImages`. New uploads are appended to that list and
 * the combined result is capped at 2 (matches the schema validator).
 */
const updateVendorProfile = async (req, res) => {
  try {
    const user = req.user;
    if (!user?.vendorId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const vendor = await Vendor.findById(user.vendorId);
    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }
    const {
      businessName,
      contact,
      location,
      address,
      password,
      accountNumber,
      bankName,
      deliveryDuration,
      paymentPreference,
      existingCoverImages,
    } = req.body;

    const vendorUpdate = {};
    if (businessName) vendorUpdate.businessName = businessName;
    if (contact) vendorUpdate.contact = contact;
    if (location) vendorUpdate.location = location;
    if (address) vendorUpdate.address = address;
    if (paymentPreference) vendorUpdate.paymentPreference = paymentPreference;
    if (deliveryDuration) vendorUpdate.deliveryDuration = deliveryDuration;

    // Logo — single file, upload.fields puts it under req.files.logo[0]
    const logoFile = req.files?.logo?.[0];
    if (logoFile?.path) vendorUpdate.logo = logoFile.path;

    // Cover images — merge kept existing URLs with newly uploaded files,
    // capped at 2
    const coverImageFiles = req.files?.coverImages || [];
    if (existingCoverImages || coverImageFiles.length > 0) {
      let keptImages = [];
      if (existingCoverImages) {
        try {
          const parsed = JSON.parse(existingCoverImages);
          if (Array.isArray(parsed)) {
            keptImages = parsed.filter((url) => typeof url === "string");
          }
        } catch (e) {
          return res.status(400).json({
            success: false,
            message: "existingCoverImages must be a valid JSON array",
          });
        }
      }
      const newImages = coverImageFiles.map((f) => f.path);
      vendorUpdate.coverImages = [...keptImages, ...newImages].slice(0, 2);
    }

    const userUpdate = {};
    if (password) {
      const salt = await bcrypt.genSalt(10);
      userUpdate.password = await bcrypt.hash(password, salt);
    }
    if (!vendor.subaccountId && accountNumber && bankName) {
      const bankCode = getBankCode(bankName);
      if (!bankCode) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid bank name" });
      }
      const paystackRes = await axios.post(
        "https://api.paystack.co/subaccount",
        {
          business_name: businessName || vendor.businessName,
          settlement_bank: bankCode,
          account_number: accountNumber,
          percentage_charge: 5,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          },
        },
      );
      vendorUpdate.accountNumber = accountNumber;
      vendorUpdate.bankName = bankName;
      vendorUpdate.subaccountId = paystackRes.data.data.subaccount_code;
    }
    const updatedVendor = await Vendor.findByIdAndUpdate(
      user.vendorId,
      { $set: vendorUpdate },
      { new: true, runValidators: true },
    );
    if (password) {
      await User.findByIdAndUpdate(user._id, { $set: userUpdate });
    }
    return res.json({ success: true, vendor: updatedVendor });
  } catch (err) {
    console.error("Update vendor error", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const getVendorWallet = async (req, res) => {
  try {
    const vendorId = req.user.vendorId;
    if (!vendorId) {
      return res
        .status(400)
        .json({ success: false, message: "Vendor ID not provided" });
    }
    const wallet = await Wallet.findOne({ vendorId });
    if (!wallet) {
      return res
        .status(404)
        .json({ success: false, message: "Wallet not found for this vendor" });
    }
    res.status(200).json({
      success: true,
      message: "Wallet successfully fetched",
      wallet,
    });
  } catch (error) {
    console.error("Could not fetch wallet:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error while fetching wallet",
    });
  }
};

const getVendorDailyIncome = async (req, res) => {
  const { vendorId, date } = req.query;
  if (!vendorId || !date) {
    return res.status(400).json({
      success: false,
      message: "Vendor ID and date are required",
    });
  }
  try {
    const start = new Date(date);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const orders = await Order.find({
      vendorId,
      paymentStatus: "paid",
      createdAt: { $gte: start, $lte: end },
    });
    const totalIncome = orders.reduce(
      (sum, order) => sum + order.totalAmount,
      0,
    );
    return res.status(200).json({
      success: true,
      vendorId,
      date,
      totalIncome,
      orderCount: orders.length,
      orders,
    });
  } catch (err) {
    console.error("Vendor income error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendor income",
    });
  }
};

const rateVendor = async (req, res) => {
  const { vendorId, comment, stars } = req.body;
  const customerId = req.user._id;
  if (!stars || stars < 1 || stars > 5) {
    return res.status(400).json({ message: "Invalid star rating." });
  }
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) return res.status(404).json({ message: "Vendor not found." });
  const existingRating = vendor.ratings.find(
    (r) => r.customerId.toString() === customerId,
  );
  if (existingRating) {
    return res
      .status(400)
      .json({ message: "You've already rated this vendor." });
  }
  vendor.ratings.push({ customerId, stars, comment });
  const totalStars = vendor.ratings.reduce((sum, r) => sum + r.stars, 0);
  vendor.averageRating =
    Math.round((totalStars / vendor.ratings.length) * 10) / 10;
  await vendor.save();
  return res.status(200).json({ message: "Rating submitted successfully." });
};

const getReviews = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const vendor = await Vendor.findById(vendorId).select("ratings");
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }
    return res.status(200).json({ reviews: vendor.ratings });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const initPromotePayment = async (req, res) => {
  try {
    const { email, amount, vendorId, tier } = req.body;
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: amount * 100,
        callback_url: `https://chowspace.vercel.app/vendors/PromotionVerification`,
        metadata: {
          vendorId,
          tier,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );
    return res.status(200).json({
      success: true,
      authorization_url: response.data.data.authorization_url,
    });
  } catch (err) {
    console.error("Paystack Init Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Payment initialization failed" });
  }
};

const verifyPromotePayment = async (req, res) => {
  try {
    const { reference } = req.body;
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      },
    );
    const data = response.data.data;
    if (data.status === "success") {
      const vendorId = data.metadata.vendorId;
      const tier = data.metadata.tier;
      const expiresAt = new Date(
        Date.now() + (tier === "basic" ? 7 : 30) * 24 * 60 * 60 * 1000,
      );
      await Vendor.findByIdAndUpdate(vendorId, {
        isPromoted: true,
        promotionExpiresAt: expiresAt,
        promotionTier: tier,
      });
      return res
        .status(200)
        .json({ success: true, message: "Vendor promoted successfully" });
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Payment verification failed" });
    }
  } catch (err) {
    console.error("Paystack Verify Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Payment verification failed" });
  }
};

const getOpeningHours = async (req, res) => {
  try {
    const vendorId = req.params.vendorId;
    if (!vendorId) {
      return res
        .status(400)
        .json({ success: false, message: "Vendor ID is required" });
    }
    const vendor = await Vendor.findById(vendorId).select("openingHours");
    if (!vendor || !vendor.openingHours) {
      return res
        .status(404)
        .json({ success: false, message: "Opening hours not available" });
    }
    res.status(200).json({
      success: true,
      message: "Opening hours found",
      openingHours: vendor.openingHours,
    });
  } catch (error) {
    console.error("Could not fetch opening hours:", error.message);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

module.exports = {
  createVendor,
  getAllVendor,
  getVendorBySlug,
  getVendorStatus,
  getTotalCountOfVendor,
  getVendorDailyIncome,
  getVendorStatusById,
  toggleVendorStatus,
  updateVendorProfile,
  getOpeningHours,
  getVendorWallet,
  rateVendor,
  initPromotePayment,
  verifyPromotePayment,
  getReviews,
};
