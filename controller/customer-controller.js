const Customer = require("../models/customer");
const User = require("../models/user");
const Order = require("../models/order");
const mongoose = require("mongoose");

const getAllCustomers = async (req, res) => {
  try {
    const customers = await Customer.find(
      {},
      {
        phone: 1,
        birthday: 1,
        fullname: 1,
        hasBirthday: 1,
        _id: 0,
      },
    );

    if (!customers || customers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Customers not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Customers fetched successfully",
      data: customers,
    });
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


const saveBirthday = async (req, res) => {
  try {
    const { phone, month, day, vendorId } = req.body;

    if (!phone || !month || !day) {
      return res
        .status(400)
        .json({ success: false, message: "phone, month and day are required" });
    }

    const dayNum = parseInt(day, 10);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) {
      return res.status(400).json({ success: false, message: "Invalid day" });
    }

    // Build both phone variants so we match however it was stored
    let normPhone = String(phone).replace(/\D/g, "");
    const phoneVariants = [normPhone];
    if (normPhone.startsWith("234")) {
      phoneVariants.push("0" + normPhone.slice(3));
    } else if (normPhone.startsWith("0")) {
      phoneVariants.push("234" + normPhone.slice(1));
    }

    // Find the user account by phone
    const user = await User.findOne({ phoneNumber: { $in: phoneVariants } });

    if (!user) {
      // Guest — upsert by phone only, never set the user field.
      // Querying by phone avoids the user_1 unique index entirely
      // so multiple guests never trigger a duplicate key error.
      await Customer.findOneAndUpdate(
        { phone: normPhone },
        {
          $set: {
            "birthday.month": month,
            "birthday.day": dayNum,
            hasBirthday: true,
            ...(vendorId ? { birthdayVendorId: vendorId } : {}),
          },
          $setOnInsert: {
            phone: normPhone,
            email: "guest@chowspace.ng",
          },
        },
        { upsert: true, new: true },
      );

      return res.status(200).json({
        success: true,
        message: "Birthday saved for guest",
      });
    }

    // Logged-in user — save birthday on their Customer record (upsert if missing)
    const customer = await Customer.findOneAndUpdate(
      { user: user._id },
      {
        $set: {
          email: user.email,
          fullname: user.fullname || "",
          phone: normPhone,
          "birthday.month": month,
          "birthday.day": dayNum,
          hasBirthday: true,
          ...(vendorId ? { birthdayVendorId: vendorId } : {}),
        },
        $setOnInsert: { user: user._id },
      },
      { upsert: true, new: true },
    );

    return res.status(200).json({
      success: true,
      message: "Birthday saved successfully",
      customerId: customer._id,
    });
  } catch (error) {
    console.error("saveBirthday error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};


module.exports = {
  getOrderHistoryByCustomer,
  getAllCustomers,
  getAllCustomersWithUserDetails,
  saveBirthday,
};
