const VendorLocation = require("../models/vendorLocation");
const Manager = require("../models/manager");
const Vendor = require("../models/vendor");
const PlatformLocation = require("../models/platformLocations");
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
    res.status(200).json({ locations });
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

const getVendorLocationsByManager = async (req, res) => {
  try {
    const { managerId } = req.params;

    // 1. Find mapping (Manager -> Vendor)
    const mapping = await Manager.findOne({ user: managerId });
    if (!mapping) {
      return res
        .status(404)
        .json({ message: "Vendor mapping not found for this manager" });
    }

    // 2. Fetch vendor
    const vendor = await Vendor.findById(mapping.vendor);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // 3. Fetch vendor locations
    const locations = await VendorLocation.find({ vendorId: vendor._id });
    if (!locations || locations.length === 0) {
      return res
        .status(404)
        .json({ message: "No locations found for this vendor" });
    }

    res.status(200).json({
      vendor: {
        _id: vendor._id,
        name: vendor.name,
      },
      locations,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateVendorLocations = async (req, res) => {
  try {
    const { managerId } = req.params;
    const { locations } = req.body;

    if (!locations || !Array.isArray(locations)) {
      return res
        .status(400)
        .json({ message: "Locations must be an array of {location, price}" });
    }

    const manager = await Manager.findOne({ user: managerId });
    if (!manager) {
      return res.status(404).json({ message: "Manager not found" });
    }

    const vendorId = manager.vendor;
    if (!vendorId) {
      return res
        .status(404)
        .json({ message: "Vendor not mapped to this manager" });
    }

    const updates = await Promise.all(
      locations.map(async ({ location, price }) => {
        return await VendorLocation.findOneAndUpdate(
          { vendorId, location },
          { $set: { price } },
          { new: true, upsert: true }
        );
      })
    );

    res.status(200).json({
      message: "Vendor locations updated successfully",
      locations: updates,
    });
  } catch (error) {
    console.error("Error updating vendor locations:", error);
    res.status(500).json({ message: error.message });
  }
};

const syncVendorLocationsToPlatform = async (req, res) => {
  try {
    const vendorLocations = await VendorLocation.find({});
    if (!vendorLocations.length) {
      return res
        .status(200)
        .json({ success: true, message: "No vendor locations found" });
    }

    let updatedCount = 0;
    let insertedCount = 0;

    for (const loc of vendorLocations) {
      const existing = await PlatformLocation.findOne({
        location: loc.location,
      });
      if (existing) {
        // Update price if different
        if (existing.price !== loc.price) {
          existing.price = loc.price;
          await existing.save();
          updatedCount++;
        }
      } else {
        // Insert new location
        await PlatformLocation.create({
          location: loc.location,
          price: loc.price,
        });
        insertedCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Platform locations synced successfully`,
      updated: updatedCount,
      inserted: insertedCount,
    });
  } catch (err) {
    console.error("Error syncing locations:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to sync locations",
    });
  }
};

const getPlatformLocations = async (req, res) => {
  try {
    const locations = await PlatformLocation.find().select("location price");
    return res.status(200).json({
      success: true,
      locations,
    });
  } catch (err) {
    console.error("Error fetching platform locations:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch platform locations",
    });
  }
};

module.exports = {
  deleteVendorLocation,
  getVendorLocations,
  createVendorLocation,
  getVendorLocationsByManager,
  updateVendorLocations,
  syncVendorLocationsToPlatform,
  getPlatformLocations,
};
