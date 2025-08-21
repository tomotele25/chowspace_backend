const Vendor = require("../models/vendor");
const User = require("../models/user");
const bcrypt = require("bcrypt");
const slugify = require("slugify");
const Manager = require("../models/manager");
const Wallet = require("../models/wallet");
const axios = require("axios");
const Order = require("../models/order");

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
      !category ||
      !paymentPreference
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      fullname,
      email,
      password: hashedPassword,
      phoneNumber: contact,
      role: "vendor",
      paymentPreference,
    });

    const slug = slugify(businessName, { lower: true, strict: true });

    const newVendor = await Vendor.create({
      user: newUser._id,
      slug,
      email,
      fullname,
      contact,
      location,
      logo,
      address,
      category,
      businessName,
      password: hashedPassword,
      paymentPreference,
    });

    res.status(200).json({
      success: true,
      message: "Account created successfully",
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
        userId: newUser._id,
      },
    });
  } catch (error) {
    console.error("Error creating vendor:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const getAllVendor = async (req, res) => {
  try {
    const now = new Date();

    // 1. Promoted vendors with unexpired promotion
    const promotedVendors = await Vendor.find(
      {
        isPromoted: true,
        promotionExpiresAt: { $gt: now },
      },
      "businessName isPromoted promotionExpiresAt paymentPreference averageRating fullname email logo location contact address category status slug accountNumber bankName subaccountId deliveryDuration"
    ).sort({ promotionExpiresAt: 1 });

    // 2. Non-promoted or expired promotion vendors
    const regularVendors = await Vendor.find(
      {
        $or: [
          { isPromoted: { $ne: true } },
          { promotionExpiresAt: { $lte: now } },
        ],
      },
      "businessName isPromoted paymentPreference promotionExpiresAt averageRating fullname email logo location contact address category status slug accountNumber bankName subaccountId deliveryDuration"
    );

    const vendors = [...promotedVendors, ...regularVendors];

    if (vendors.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No vendors found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Vendors successfully found",
      vendors,
    });
  } catch (error) {
    console.error("Error fetching vendors:", error.message);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const getVendorBySlug = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ slug: req.params.slug });
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }
    res.status(200).json({ success: true, vendor });
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

    const vendor = await Vendor.findById(vendorId).select("status");

    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }

    res.status(200).json({ success: true, status: vendor.status });
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

    const vendor = await Vendor.findById(vendorId).select("status");

    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }

    res.status(200).json({ success: true, status: vendor.status });
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
        "vendor"
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

    // Update vendor status
    const updatedVendor = await Vendor.findByIdAndUpdate(
      vendorId,
      { status },
      { new: true }
    );

    if (!updatedVendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }

    res.status(200).json({
      success: true,
      message: `Store is now ${status}`,
      vendor: updatedVendor,
    });
  } catch (err) {
    console.error("Toggle error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

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
    } = req.body;

    const vendorUpdate = {};
    if (businessName) vendorUpdate.businessName = businessName;
    if (contact) vendorUpdate.contact = contact;
    if (location) vendorUpdate.location = location;
    if (address) vendorUpdate.address = address;
    if (paymentPreference) vendorUpdate.paymentPreference = paymentPreference;
    if (deliveryDuration) vendorUpdate.deliveryDuration = deliveryDuration;
    if (req.file && req.file.path) vendorUpdate.logo = req.file.path;

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
        }
      );

      vendorUpdate.accountNumber = accountNumber;
      vendorUpdate.bankName = bankName;
      vendorUpdate.subaccountId = paystackRes.data.data.subaccount_code;
    }

    const updatedVendor = await Vendor.findByIdAndUpdate(
      user.vendorId,
      { $set: vendorUpdate },
      { new: true }
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
      error: err.message,
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
      0
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
    (r) => r.customerId.toString() === customerId
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
      }
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
      }
    );

    const data = response.data.data;

    if (data.status === "success") {
      const vendorId = data.metadata.vendorId;
      const tier = data.metadata.tier;

      const expiresAt = new Date(
        Date.now() + (tier === "basic" ? 7 : 30) * 24 * 60 * 60 * 1000
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

const updateStoreHours = async (req, res) => {
  try {
    const user = req.user; // set by your auth middleware
    let vendorId;

    if (user.role === "vendor") {
      vendorId = user.vendorId;
    } else if (user.role === "manager") {
      vendorId = user.createdBy; // the vendor the manager belongs to
    } else {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (!vendorId) {
      return res.status(400).json({ error: "Vendor not found" });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    vendor.openingHours = req.body.openingHours;
    await vendor.save();

    res.json({ success: true, vendor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
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

const autoToggleStatus = async (req, res) => {
  const { vendorId } = req.params;
  const { status } = req.body;

  try {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    vendor.status = status;
    await vendor.save();

    res.json({ success: true, vendor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
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
  updateStoreHours,
  getReviews,
  autoToggleStatus,
};
