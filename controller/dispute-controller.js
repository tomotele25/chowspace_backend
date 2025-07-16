const Dispute = require("../models/dispute");
const Order = require("../models/order");
const createOrderDispute = async (req, res) => {
  try {
    const { reasons, message, orderId } = req.body;

    if (!orderId || !reasons || reasons.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    const orderExist = await Order.findById(orderId);
    const disputeExist = await Dispute.findOne({ order: orderId });

    if (!orderExist) {
      return res
        .status(400)
        .json({ success: false, message: "Order not found" });
    }
    if (disputeExist) {
      return res
        .status(400)
        .json({ success: false, message: "Dispute already made" });
    }

    const newDispute = new Dispute({
      reason: reasons,
      message,
      order: orderId,
    });

    await newDispute.save();

    res.status(200).json({
      success: true,
      message: "Dispute created successfully",
      dispute: newDispute,
    });
  } catch (error) {
    console.log("Error creating Dispute", error.message);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

const getVendorDisputes = async (req, res) => {
  try {
    const vendorId = req.user.vendorId;

    const orders = await Order.find({ vendorId }).select("_id");

    const orderIds = orders.map((order) => order._id);

    const disputes = await Dispute.find({ order: { $in: orderIds } })
      .populate("order")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      disputes,
    });
  } catch (error) {
    console.error("Error fetching vendor disputes:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getDisputeReasons = (req, res) => {
  const reasons = [
    "Order not delivered on time",
    "Order never arrived",
    "Incomplete order",
    "Wrong items delivered",
    "Food was spoiled or bad",
    "Packaging was damaged or leaking",
    "Other",
  ];
  res
    .status(200)
    .json({ success: true, message: "Reasons fetched successfully", reasons });
};

module.exports = { getVendorDisputes, createOrderDispute, getDisputeReasons };
