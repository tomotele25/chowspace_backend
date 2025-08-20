const VendorLocation = require("../models/vendorLocation");
const Manager = require("../models/manager");
const Vendor = require("../models/vendor");

const createVendorLocation = async (req, res) => {
  try {
    const { location, price } = req.body;

    if (!location || !price) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const user = req.user;

    let vendorId;

    if (user.role === "vendor") {
      vendorId = user._id;
    } else if (user.role === "manager" && user.vendorId) {
      vendorId = user.vendorId;
    } else {
      return res.status(404).json({ message: "Vendor or manager not found." });
    }

    // Check if location already exists for this vendor
    const existing = await VendorLocation.findOne({
      vendorId,
      location: location.trim(),
    });

    if (existing) {
      return res.status(400).json({
        message: "This location already exists for this vendor.",
      });
    }

    // Create new location
    const newLocation = await VendorLocation.create({
      vendorId,
      location: location.trim(),
      price,
    });

    res.status(201).json(newLocation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create vendor location." });
  }
};
// Get all locations for a vendor
const getVendorLocations = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const locations = await VendorLocation.find({ vendorId }).sort({
      location: 1,
    });
    res.status(200).json(locations);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch vendor locations." });
  }
};

// Delete a vendor location
const deleteVendorLocation = async (req, res) => {
  try {
    const { id } = req.params;
    await VendorLocation.findByIdAndDelete(id);
    res.status(200).json({ message: "Location deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete location." });
  }
};

const addPack = async (req, res) => {
  try {
    const { managerId } = req.params;
    const { name, fee } = req.body;

    if (!name || !fee) {
      return res.status(400).json({ message: "Name and fee are required" });
    }

    // Step 1: Find manager
    const manager = await Manager.findOne({
      user: req.params.managerId,
    }).populate("vendor");
    if (!manager) {
      return res.status(404).json({ message: "Manager not found" });
    }

    // Step 2: Update vendor linked to this manager
    const updatedVendor = await Vendor.findByIdAndUpdate(
      manager.vendor._id,
      {
        $push: { packOptions: { name, fee } },
      },
      { new: true }
    );

    if (!updatedVendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    res.status(200).json({
      message: "Pack added successfully",
    });
  } catch (error) {
    console.error("Error adding pack:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
module.exports = {
  deleteVendorLocation,
  getVendorLocations,
  createVendorLocation,
  addPack,
};
