require("dotenv").config();
const axios = require("axios");
const Order = require("../models/order");
const Vendor = require("../models/vendor");
const Wallet = require("../models/wallet");
const { orderConfirmationEmail } = require("../mailer");
const Customer = require("../models/customer");
const crypto = require("crypto");
// INITIATE PAYMENT WITH PAYSTACK
const initializePaystackPayment = async (req, res) => {
  try {
    const {
      amount,
      email,
      vendorId,
      tx_ref,
      orderPayload,
      guestInfo,
      customerId,
    } = req.body;

    if (!amount || !email || !vendorId || !tx_ref || !orderPayload) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor || !vendor.subaccountId) {
      return res.status(400).json({
        success: false,
        message: "Vendor or subaccount not found",
      });
    }

    const newOrderData = {
      vendorId,
      items: orderPayload.items,
      deliveryMethod: orderPayload.deliveryMethod,
      note: orderPayload.note || "",
      totalAmount: amount,
      paymentRef: tx_ref,
      paymentStatus: "pending",
    };

    if (customerId) {
      newOrderData.customerId = customerId;
    } else if (guestInfo) {
      newOrderData.guestInfo = guestInfo;
    } else {
      return res.status(400).json({
        success: false,
        message: "No customer or guest info provided",
      });
    }

    const pendingOrder = await Order.create(newOrderData);

    // 👉 Add order to Customer's order list
    if (customerId) {
      await Customer.findOneAndUpdate(
        { user: customerId },
        { $push: { order: pendingOrder._id } },
        { new: true, upsert: true }
      );
    }

    const payload = {
      email,
      amount: Math.round(Number(amount) * 100),
      reference: tx_ref,
      callback_url: "https://chowspace.ng/Payment-Redirect",
      subaccount: vendor.subaccountId,
    };

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: "Payment initialized and order saved",
      paymentLink: response.data.data.authorization_url,
      orderId: pendingOrder._id,
    });
  } catch (error) {
    console.error("Init error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to initialize payment",
      error: error.response?.data || error.message,
    });
  }
};

// VERIFY PAYMENT AND CREDIT VENDOR WALLET
const verifyPaystackPayment = async (req, res) => {
  const { reference } = req.body;

  try {
    const result = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const data = result.data.data;

    if (data.status !== "success") {
      return res
        .status(400)
        .json({ success: false, message: "Payment failed", data });
    }

    const order = await Order.findOne({ paymentRef: reference });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (data.amount !== order.totalAmount * 100) {
      return res.status(400).json({
        success: false,
        message: "Amount mismatch. Payment not valid.",
      });
    }

    // Update payment status
    if (order.paymentStatus !== "paid") {
      order.paymentStatus = "paid";
      await order.save();
    }

    try {
      await orderConfirmationEmail(
        order.guestInfo.email,
        "Your Chowspace Order Has Been Confirmed 🎉"
      );
    } catch (err) {
      console.error("Email failed:", err);
    }

    // Credit wallet, etc...
    const wallet = await Wallet.findOne({ vendorId: order.vendorId });
    if (wallet) {
      const amountPaid = data.amount / 100;
      wallet.balance += amountPaid;
      wallet.transactions.unshift({
        type: "credit",
        amount: amountPaid,
        description: `Order #${order._id} - Payment via Paystack`,
      });
      await wallet.save();
    }

    return res
      .status(200)
      .json({ success: true, message: "Payment verified", order });
  } catch (err) {
    console.error("Verify error", err.response?.data || err.message);
    res.status(500).json({ success: false, message: "Internal error" });
  }
};

const createOrder = async (req, res) => {
  const {
    items,
    guestInfo,
    customerInfo,
    deliveryMethod,
    note,
    totalAmount,
    vendorId,
    packFees,
    deliveryFee,
    orderId,
  } = req.body;

  if (
    !items ||
    (!guestInfo && !customerInfo) ||
    !deliveryMethod ||
    !totalAmount ||
    !vendorId ||
    !orderId
  ) {
    return res.status(400).json({ message: "Missing required order fields." });
  }

  try {
    const confirmationToken = crypto.randomBytes(16).toString("hex");

    const newOrder = await Order.create({
      orderId,
      vendorId,
      items,
      guestInfo: guestInfo || null,
      customerInfo: customerInfo || null,
      deliveryMethod,
      note: note || "",
      totalAmount,
      packFees: packFees || [],
      deliveryFee: deliveryFee || 0,
      paymentMethod: "direct",
      paymentStatus: "pending",
      confirmationToken,
    });

    res.status(201).json(newOrder);
  } catch (err) {
    console.error("Order creation failed:", err);
    res.status(500).json({ message: "Failed to create order." });
  }
};

const priceConfirmation = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId }).select(
      "totalAmount vendorId guestInfo items"
    );

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // ✅ Respond with the full order info if needed
    res.status(200).json({
      success: true,
      message: "Order fetched successfully",
      order,
      totalAmount: order.totalAmount,
    });
  } catch (error) {
    console.error("Price confirmation error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// GET ALL ORDERS (OPTIONALLY BY VENDOR)
const getAllOrders = async (req, res) => {
  const { vendorId } = req.query;

  try {
    const query = vendorId ? { vendorId } : {};
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .populate("customerId", "fullname email");

    res.status(200).json({
      success: true,
      orders,
      message: "Orders fetched successfully",
    });
  } catch (err) {
    console.error("Fetching orders failed:", err);
    res.status(500).json({ message: "Failed to fetch orders." });
  }
};

// GET SINGLE ORDER
const getOrderById = async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found." });

    res.json(order);
  } catch (err) {
    console.error("Fetching order failed:", err);
    res.status(500).json({ message: "Failed to fetch order." });
  }
};

// UPDATE ORDER STATUS
const updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status, paymentStatus } = req.body;

  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found." });

    if (status) order.status = status;
    if (paymentStatus) order.paymentStatus = paymentStatus;

    await order.save();
    res.json(order);
  } catch (err) {
    console.error("Updating order failed:", err);
    res.status(500).json({ message: "Failed to update order." });
  }
};

// MANAGER ORDERS ONLY
const getManagerOrders = async (req, res) => {
  try {
    const user = req.user;

    if (!user || user.role !== "manager") {
      return res
        .status(403)
        .json({ message: "Access denied. Only managers allowed." });
    }

    const vendorId = user.vendorId;
    if (!vendorId) {
      return res
        .status(400)
        .json({ message: "No vendor ID associated with manager." });
    }

    const orders = await Order.find({ vendorId })
      .sort({ createdAt: -1 })
      .populate("customerId", "fullname email");

    return res.status(200).json({ success: true, orders });
  } catch (err) {
    console.error("Error fetching manager orders:", err);
    return res
      .status(500)
      .json({ message: "Failed to fetch orders for manager." });
  }
};

// DELETE OLD PENDING ORDERS
const cleanupPendingOrders = async (req, res) => {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const result = await Order.deleteMany({
      paymentStatus: "pending",
      createdAt: { $lt: tenMinutesAgo },
    });

    res.status(200).json({
      success: true,
      deletedCount: result.deletedCount,
      message: "Old pending orders cleaned up.",
    });
  } catch (err) {
    console.error("Cleanup failed:", err);
    res.status(500).json({
      success: false,
      message: "Failed to cleanup pending orders.",
    });
  }
};

const getAllOrdersForAdmin = async (req, res) => {
  try {
    const orders = await Order.find({})
      .populate("vendorId", "name")
      .populate("customerId", "email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      orders,
    });
  } catch (err) {
    console.error("Error fetching orders for admin:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching orders",
    });
  }
};

module.exports = {
  initializePaystackPayment,
  verifyPaystackPayment,
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  getManagerOrders,
  cleanupPendingOrders,
  getAllOrdersForAdmin,
  priceConfirmation,
};
