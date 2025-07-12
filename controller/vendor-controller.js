const Vendor = require("../models/vendor");
const User = require("../models/user");
const bcrypt = require("bcrypt");
const slugify = require("slugify");
const Manager = require("../models/manager");
const Wallet = require("../models/wallet");
const axios = require("axios");

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;

const BANK_CODES = {
  "Access Bank": "044",
  EcoBank: "050",
  "Fidelity Bank": "070",
  "First Bank": "011",
  "Guaranty Trust Bank": "058",
  "Kuda Microfinance Bank": "50211",
  "Moniepoint MFB": "50515",
  Opay: "999991",
  Paycom: "999991",
  Palmpay: "999992",
  "Stanbic IBTC Bank": "221",
  UBA: "033",
  "Union Bank": "032",
  "Zenith Bank": "057",
};

const getBankCode = (bankName) => BANK_CODES[bankName] || null;

const verifyAccount = async (accountNumber, bankCode) => {
  try {
    const response = await axios.get(
      "https://api.flutterwave.com/v3/accounts/resolve",
      {
        params: { account_number: accountNumber, account_bank: bankCode },
        headers: { Authorization: `Bearer ${FLW_SECRET_KEY}` },
      }
    );
    return response.data.data;
  } catch (err) {
    throw new Error("Invalid account details or Flutterwave error");
  }
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
      return res
        .status(400)
        .json({ success: false, message: "All fields required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      fullname,
      email,
      password: hashedPassword,
      phoneNumber: contact,
      role: "vendor",
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
    });

    await Wallet.create({
      vendorId: newVendor._id,
      balance: 0,
      transactions: [],
    });

    return res.status(200).json({
      success: true,
      message: "Vendor created",
      user: { ...newVendor._doc, userId: newUser._id },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateVendorProfile = async (req, res) => {
  try {
    const user = req.user;
    if (!user?.vendorId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const vendorId = user.vendorId;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor)
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });

    const {
      businessName,
      contact,
      location,
      address,
      password,
      accountNumber,
      bankName,
    } = req.body;
    const updates = { businessName, contact, location, address };
    if (req.file) updates.logo = req.file.path;

    const shouldCreateSubaccount =
      !vendor.accountNumber && accountNumber && bankName;
    if (shouldCreateSubaccount) {
      const bankCode = getBankCode(bankName);
      if (!bankCode)
        return res
          .status(400)
          .json({ success: false, message: "Invalid bank name" });
      await verifyAccount(accountNumber, bankCode);

      const { data } = await axios.post(
        "https://api.flutterwave.com/v3/subaccounts",
        {
          account_bank: bankCode,
          account_number: accountNumber,
          business_name: businessName,
          business_email: vendor.email,
          split_type: "percentage",
          split_value: 0.9,
        },
        {
          headers: {
            Authorization: `Bearer ${FLW_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      updates.accountNumber = accountNumber;
      updates.bankName = bankName;
      updates.subaccountId = data.subaccount_id;
    }

    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      await User.findByIdAndUpdate(user._id, { password: hashed });
    }

    const updatedVendor = await Vendor.findByIdAndUpdate(vendorId, updates, {
      new: true,
    });
    return res.status(200).json({
      success: true,
      message: "Profile updated",
      vendor: updatedVendor,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Update failed", error: err.message });
  }
};

const getAllVendor = async (req, res) => {
  try {
    const vendors = await Vendor.find(
      {},
      "businessName logo location contact address category status slug accountNumber bankName subaccountId"
    );
    return res.status(200).json({ success: true, vendors });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getVendorBySlug = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ slug: req.params.slug });
    if (!vendor)
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    res.status(200).json({ success: true, vendor });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

const getVendorStatus = async (req, res) => {
  try {
    const user = req.user;
    let vendorId =
      req.params.vendorId ||
      user.vendorId ||
      (await Manager.findOne({ user: user._id }).select("vendor")).vendor;
    const vendor = await Vendor.findById(vendorId).select("status");
    if (!vendor)
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    res.status(200).json({ success: true, status: vendor.status });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getVendorStatusById = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.vendorId).select("status");
    if (!vendor)
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    res.status(200).json({ success: true, status: vendor.status });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getTotalCountOfVendor = async (req, res) => {
  try {
    const totalVendor = await User.countDocuments({ role: "vendor" });
    res.status(200).json({ success: true, totalVendor });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const toggleVendorStatus = async (req, res) => {
  const { status } = req.body;
  if (!["opened", "closed"].includes(status))
    return res.status(400).json({ success: false, message: "Invalid status" });
  try {
    if (req.user.role !== "manager")
      return res.status(403).json({ success: false, message: "Unauthorized" });
    const manager = await Manager.findOne({ user: req.user._id }).populate(
      "vendor"
    );
    const updatedVendor = await Vendor.findByIdAndUpdate(
      manager.vendor._id,
      { status },
      { new: true }
    );
    res.status(200).json({ success: true, vendor: updatedVendor });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getVendorWallet = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ vendorId: req.user.vendorId });
    if (!wallet)
      return res
        .status(404)
        .json({ success: false, message: "Wallet not found" });
    res.status(200).json({ success: true, wallet });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  createVendor,
  updateVendorProfile,
  getAllVendor,
  getVendorBySlug,
  getVendorStatus,
  getVendorStatusById,
  getTotalCountOfVendor,
  toggleVendorStatus,
  getVendorWallet,
};
