const Rider = require("../models/rider");
const Order = require("../models/order");
const Vendor = require("../models/vendor");

// Create a new rider (platform default)
const createRider = async (req, res) => {
  try {
    const { fullname, contact, type, location } = req.body;

    if (!fullname || !contact) {
      return res.status(400).json({
        success: false,
        message: "Full name and contact are required",
      });
    }

    const newRider = new Rider({
      fullname,
      contact,
      status: "inactive",
      type: type || "platform",
      location,
    });

    await newRider.save();

    res.status(201).json({
      success: true,
      message: "Rider created successfully",
      rider: newRider,
    });
  } catch (error) {
    console.error("Error creating rider:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get all riders
const getRiders = async (req, res) => {
  try {
    const riders = await Rider.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: riders.length,
      riders,
    });
  } catch (error) {
    console.error("Error fetching riders:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get single rider by ID
const getRiderById = async (req, res) => {
  try {
    const rider = await Rider.findById(req.params.id);
    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    res.status(200).json({
      success: true,
      rider,
    });
  } catch (error) {
    console.error("Error fetching rider:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update rider
const updateRider = async (req, res) => {
  try {
    const rider = await Rider.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Rider updated successfully",
      rider,
    });
  } catch (error) {
    console.error("Error updating rider:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Delete rider
const deleteRider = async (req, res) => {
  try {
    const rider = await Rider.findByIdAndDelete(req.params.id);

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Rider deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting rider:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Assign order to rider
const assignOrderToRider = async (req, res) => {
  try {
    const { riderId, orderId, to } = req.body;

    if (!riderId || !orderId || !to) {
      return res.status(400).json({
        success: false,
        message: "Rider, order, and delivery address are required",
      });
    }

    const rider = await Rider.findById(riderId);
    const order = await Order.findById(orderId);
    if (!rider || !order) {
      return res
        .status(404)
        .json({ success: false, message: "Rider or Order not found" });
    }

    const vendor = await Vendor.findById(order.vendorId);
    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }

    const assignedOrder = {
      orderId: order._id,
      vendorName: vendor.businessName,
      from: vendor.address || "N/A",
      to,
      assignedAt: new Date(),
    };

    rider.assignedOrders.push(assignedOrder);
    await rider.save();

    // Optionally update order status
    order.status = "assigned";
    order.rider = riderId;
    await order.save();

    res.status(200).json({
      success: true,
      message: "Order assigned successfully",
      assignedOrder,
    });
  } catch (error) {
    console.error("Error assigning order to rider:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  createRider,
  getRiders,
  getRiderById,
  updateRider,
  deleteRider,
  assignOrderToRider,
};
