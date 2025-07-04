const Vendor = require("../models/vendor");
const User = require("../models/user");
const bcrypt = require("bcrypt");
const slugify = require("slugify");
const Manager = require("../models/manager");
const cloudinary = require("../utils/cloudinary");
const multer = require("multer");

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

const getAllVendor = async (req, res) => {
  try {
    const vendors = await Vendor.find(
      {},
      "businessName logo location contact address category status"
    );
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
    console.error("Error fetching vendors:", error.message);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const getTotalCountOfVendor = async (req, res) => {
  try {
    const totalVendor = await User.countDocuments({ role: "vendor" });
    if (!totalVendor) {
      return res
        .status(400)
        .json({ success: false, message: "Vendors not found" });
    }
    res.status(200).json({
      success: true,
      message: "Vendor Fetched Successfully",
      totalVendor,
    });
  } catch (error) {
    console.error("Unable to fetch total vendor", error.message);
    res.status(500).json({ success: false, message: "Server Error" });
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

const updateVendorProfile = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.vendorId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: vendorId not found",
      });
    }

    const vendorId = user.vendorId;
    const userId = user._id;

    const { businessName, contact, location, address, password } = req.body;

    const vendorUpdateData = {
      businessName,
      contact,
      location,
      address,
    };

    const userUpdateData = {};

    if (password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      userUpdateData.password = hashedPassword;
    }

    if (req.file) {
      vendorUpdateData.logo = req.file.path;
    }

    // Update vendor profile
    const updatedVendor = await Vendor.findByIdAndUpdate(
      vendorId,
      vendorUpdateData,
      { new: true }
    );

    if (!updatedVendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    if (password) {
      await User.findByIdAndUpdate(userId, userUpdateData);
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      vendor: updatedVendor,
    });
  } catch (error) {
    console.error("Error updating vendor profile:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

module.exports = {
  createVendor,
  getAllVendor,
  getVendorBySlug,
  getTotalCountOfVendor,
  getVendorStatus,
  toggleVendorStatus,
  updateVendorProfile,
};
