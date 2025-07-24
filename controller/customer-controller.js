const Customer = require("../models/customer");
const User = require("../models/user");
const Order = require("../models/order");
const mongoose = require("mongoose");

const getAllCustomers = async (req, res) => {
  try {
    const customers = await User.find({ role: "customer" });
    if (!customers) {
      return res
        .status(400)
        .json({ success: false, message: "Customers not found" });
    }

    res
      .status(200)
      .json({ success: true, message: "Customers fetched successfully" });
  } catch (error) {
    console.error("Unable to fetch customers", error.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const getAllCustomersWithUserDetails = async (req, res) => {
  try {
    const users = await User.find({ role: "customer" });

    if (!users.length) {
      return res
        .status(404)
        .json({ message: "No users with role 'customer' found." });
    }

    const created = [];
    const skipped = [];

    for (const user of users) {
      const existing = await Customer.findOne({ user: user._id });

      if (!existing) {
        const newCustomer = new Customer({
          user: user._id,
          fullname: user.fullname || user.name || "",
          email: user.email || "",
          phone: user.phone || "",
        });

        await newCustomer.save();
        created.push(user.email);
      } else {
        skipped.push(user.email);
      }
    }

    res.status(200).json({
      message: "Customer sync completed",
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
    });
  } catch (error) {
    console.error("Sync error:", error);
    res.status(500).json({ message: "Error syncing customers", error });
  }
};

const getOrderHistoryByCustomer = async (req, res) => {
  const { customerId } = req.params;

  if (!customerId) {
    return res
      .status(400)
      .json({ success: false, message: "Customer ID required" });
  }

  try {
    const orders = await Order.find({ customerId }).sort({ createdAt: -1 });

    if (!orders || orders.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No orders found for this customer" });
    }

    return res.status(200).json({ success: true, orders });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

module.exports = {
  getOrderHistoryByCustomer,
  getAllCustomers,
  getAllCustomersWithUserDetails,
};
