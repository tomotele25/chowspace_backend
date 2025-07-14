require("dotenv").config();
const axios = require("axios");
const Order = require("../models/order");
const Vendor = require("../models/vendor");
const Wallet = require("../models/wallet");

// INITIATE PAYMENT WITH PAYSTACK
const initializePaystackPayment = async (req, res) => {
  try {
    const { amount, email, vendorId, tx_ref, orderPayload } = req.body;

    if (!amount || !email || !vendorId || !tx_ref || !orderPayload) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Fetch vendor to get subaccount ID
    const vendor = await Vendor.findById(vendorId);
    if (!vendor || !vendor.subaccountId) {
      return res.status(400).json({
        success: false,
        message: "Vendor or subaccount not found",
      });
    }

    // Deduct ₦100 from amount to retain as platform fee
    const amountToVendor = amount - 100;

    // Save the pending order
    const pendingOrder = await Order.create({
      vendorId,
      items: orderPayload.items,
      guestInfo: orderPayload.guestInfo,
      deliveryMethod: orderPayload.deliveryMethod,
      note: orderPayload.note || "",
      totalAmount: amount,
      paymentRef: tx_ref,
      paymentStatus: "pending",
    });

    const payload = {
      email,
      amount: totalAmount * 100,
      reference: tx_ref,
      callback_url: "https://chowspace.vercel.app/Payment-Redirect",
      split: {
        type: "flat",
        bearer_type: "account",
        subaccounts: [
          {
            subaccount: vendor.subaccountId,
            share: (totalAmount - 100) * 100,
          },
        ],
      },
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
      error: error.message,
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

    // Update payment status
    if (order.paymentStatus !== "paid") {
      order.paymentStatus = "paid";
      await order.save();
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

// MANUAL ORDER CREATION (IF NEEDED)
const createOrder = async (req, res) => {
  const {
    items,
    guestInfo,
    deliveryMethod,
    note,
    totalAmount,
    vendorId,
    paymentReference,
  } = req.body;

  if (!items || !guestInfo || !deliveryMethod || !totalAmount || !vendorId) {
    return res.status(400).json({ message: "Missing required order fields." });
  }

  try {
    const newOrder = await Order.create({
      vendorId,
      items,
      guestInfo,
      deliveryMethod,
      note: note || "",
      totalAmount,
      paymentReference: paymentReference || null,
    });

    res.status(201).json(newOrder);
  } catch (err) {
    console.error("Order creation failed:", err);
    res.status(500).json({ message: "Failed to create order." });
  }
};

// GET ALL ORDERS (OPTIONALLY BY VENDOR)
const getAllOrders = async (req, res) => {
  const { vendorId } = req.query;

  try {
    const query = vendorId ? { vendorId } : {};
    const orders = await Order.find(query).sort({ createdAt: -1 });

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

    const orders = await Order.find({ vendorId }).sort({ createdAt: -1 });

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

const orderDispute = async (req, res) => {
  const { orderId } = req.body;
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
};
