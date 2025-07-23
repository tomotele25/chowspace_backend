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
      vendorId: vendor._id,
      createdBy: req.user._id,
    });

    const newManager = new Manager({
      user: user._id,
      vendor: vendor._id,
    });

    await newManager.save();
    await newManager.populate("vendor");

    res.status(201).json({
      success: true,
      message: "Manager created",
      manager: newManager,
      status: newManager.vendor.status,
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

const getManagersWithStatus = async (req, res) => {
  try {
    const managers = await Manager.find().populate("vendor");

    const result = managers.map((manager) => ({
      _id: manager._id,
      user: manager.user,
      vendor: manager.vendor._id,
      vendorStatus: manager.vendor.status,
    }));

    res.status(200).json({ success: true, managers: result });
  } catch (err) {
    console.error("Failed to get managers:", err);
    res.status(500).json({ message: "Error fetching managers" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const managerId = req.params.managerId;
    const { fullname, email, newPassword } = req.body;

    const manager = await User.findById(managerId);
    if (!manager || manager.role !== "manager") {
      return res
        .status(404)
        .json({ success: false, message: "Manager not found" });
    }

    if (fullname) manager.fullname = fullname;
    if (email) manager.email = email;

    if (newPassword) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      manager.password = hashedPassword;
    }

    await manager.save();

    res
      .status(200)
      .json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    console.error("Update Manager Error:", error);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

module.exports = {
  createManager,
  getManagers,
  getManagersWithStatus,
  updateProfile,
};
