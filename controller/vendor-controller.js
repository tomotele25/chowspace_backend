const Vendor = require("../models/vendor");
const User = require("../models/user");
const bcrypt = require("bcrypt");
const slugify = require("slugify");
const Manager = require("../models/manager");
const createVendor = async (req, res) => {
  const {
    email,
    password,
    fullname,
    businessName,
    contact,
    logo,
    location,
    address,
    category,
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

    // Response
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

// Get All Vendors
const getAllVendor = async (req, res) => {
  try {
    const vendors = await Vendor.find();

    if (!vendors || vendors.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No vendors found" });
    }

    return res.status(200).json({
      success: true,
      message: "Vendors successfully found",
      vendors,
    });
  } catch (error) {
    console.error("Error fetching vendors:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get Vendor by Slug
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

const toggleVendorStatus = async (req, res) => {
  const { status } = req.body;

  if (!["opened", "closed"].includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid status" });
  }

  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Only managers can perform this action",
      });
    }

    const managerDoc = await Manager.findOne({ user: req.user._id }).populate(
      "vendor"
    );

    if (!managerDoc || !managerDoc.vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found for manager" });
    }

    const updatedVendor = await Vendor.findByIdAndUpdate(
      managerDoc.vendor._id,
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

const getVendorStatus = async (req, res) => {
  const { vendorId } = req.params;

  if (!vendorId) {
    return res
      .status(400)
      .json({ success: false, message: "vendorId is required" });
  }

  try {
    const vendor = await Vendor.findById(vendorId).select("status");
    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }
    res.status(200).json({ success: true, status: vendor.status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  createVendor,
  getAllVendor,
  getVendorBySlug,
  getVendorStatus,
  toggleVendorStatus,
};
