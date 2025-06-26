const bcrypt = require("bcrypt");
const User = require("../models/user");
const Manager = require("../models/manager");
const Vendor = require("../models/vendor");

async function createManager(req, res) {
  try {
    const { fullname, email, phoneNumber, password } = req.body;

    const vendor = await Vendor.findOne({ user: req.user._id });
    if (!vendor) {
      return res
        .status(403)
        .json({ message: "Only vendors can create managers" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      fullname,
      email,
      phoneNumber,
      password: hashedPassword,
      role: "manager",
      vendorId: vendor._id, // ✅ Attach the vendorId to the user
      createdBy: req.user._id,
    });

    const newManager = new Manager({
      user: user._id,
      vendor: vendor._id,
    });

    await newManager.save();

    res.status(201).json({
      success: true,
      message: "Manager created",
      manager: newManager,
    });
  } catch (error) {
    console.error("Create manager error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
}

async function getManagers(req, res) {
  if (!req.user || req.user.role !== "vendor") {
    return res
      .status(403)
      .json({ message: "Only vendors can view their managers" });
  }

  try {
    const managers = await User.find({
      role: "manager",
      createdBy: req.user._id,
    });

    res.status(200).json({ success: true, managers });
  } catch (error) {
    console.error("Error fetching managers:", error);
    res.status(500).json({ message: "Server error" });
  }
}

const getManagerVendor = async (req, res) => {
  const managerId = req.params.managerId;

  try {
    const manager = await Manager.findById(managerId);
    if (!manager) {
      return res
        .status(404)
        .json({ success: false, message: "Manager not found" });
    }

    const vendor = await Vendor.findById(manager.vendorId);
    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }

    res.status(200).json({
      success: true,
      vendorId: vendor._id,
      vendorSlug: vendor.slug,
      status: vendor.status,
    });
  } catch (error) {
    console.error("Error getting vendor for manager:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  createManager,
  getManagerVendor,
  getManagers,
};
