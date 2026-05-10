require("dotenv").config();
const axios = require("axios");
const Order = require("../models/order");
const Vendor = require("../models/vendor");
const Wallet = require("../models/wallet");
const { orderConfirmationEmail } = require("../mailer");
const Customer = require("../models/customer");
const crypto = require("crypto");

const { MoneiSDK } = require("monei-sdk");
const monei = new MoneiSDK( process.env.MONEI_SECRET_KEY );


const initializeMoneiPayment = async (req, res) => {
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
    if (!vendor) {
      return res.status(400).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const newOrderData = {
      orderId: tx_ref,
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
        { new: true, upsert: true },
      );
    }

  
    const deposit = await monei.deposit.initializeDeposit({
      method: "BANK_TRANSFER",
      amount: Math.round(Number(amount) * 100), // naira → kobo
      reference: tx_ref,
      currency: "NGN",
      narration: `Order ${pendingOrder._id} — ${vendor.businessName}`,
    });

    return res.status(200).json({
      success: true,
      message: "Payment initialized and order saved",
      orderId: pendingOrder._id,
      deposit: {
        reference: deposit.reference,
        accountNumber: deposit.accountNumber,
        bankName: deposit.bankName,
        accountName: deposit.accountName,
        amount: deposit.amount,
        expiry_datetime: deposit.expiry_datetime,
        note: deposit.note,
        status: deposit.status,
      },
    });
  }  catch (error) {
  console.error("Monei init error FULL:", error); 
  console.error("Monei init error message:", error.message);
  console.error("Monei init error response:", error.response?.data);
  console.error("Monei init error stack:", error.stack);
  return res.status(500).json({
    success: false,
    message: "Failed to initialize payment",
    error: error.message || error.toString(),
  });
}
};


const verifyMoneiPayment = async (req, res) => {
  const { reference } = req.body;

  try {
    // 👉 Real SDK method is getStatus (not verify)
    const depositStatus = await monei.deposit.getStatus({ reference });

    if (
      depositStatus.status !== "COMPLETED" &&
      depositStatus.status !== "SUCCESS"
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment not yet confirmed",
        status: depositStatus.status,
      });
    }

    const order = await Order.findOne({ paymentRef: reference });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Guard against double-processing
    if (order.paymentStatus === "paid") {
      return res.status(200).json({
        success: true,
        message: "Payment already verified",
        order,
      });
    }

    // Update payment status
    order.paymentStatus = "paid";
    await order.save();

    // 👉 Send confirmation email
    try {
      const emailAddress = order.guestInfo?.email || order.customerInfo?.email;
      if (emailAddress) {
        await orderConfirmationEmail(
          emailAddress,
          "Your Chowspace Order Has Been Confirmed 🎉",
        );
      }
    } catch (err) {
      console.error("Email failed:", err);
    }

    // 👉 Credit vendor wallet
    const wallet = await Wallet.findOne({ vendorId: order.vendorId });
    if (wallet) {
      const amountPaid = depositStatus.amount / 100; // kobo → naira
      wallet.balance += amountPaid;
      wallet.transactions.unshift({
        type: "credit",
        amount: amountPaid,
        description: `Order #${order._id} - Payment via Monei`,
      });
      await wallet.save();
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified",
      order,
    });
  } catch (err) {
    console.error("Monei verify error:", err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      message: "Internal error during payment verification",
    });
  }
};


const moneiWebhook = async (req, res) => {
  try {
    const event = req.body;

    if (event.status !== "COMPLETED" && event.status !== "SUCCESS") {
      return res.status(200).json({ received: true });
    }

    const reference = event.reference;
    const order = await Order.findOne({ paymentRef: reference });

    if (!order || order.paymentStatus === "paid") {
      return res.status(200).json({ received: true });
    }

    order.paymentStatus = "paid";
    await order.save();

    // Credit vendor wallet
    const wallet = await Wallet.findOne({ vendorId: order.vendorId });
    if (wallet) {
      const amountPaid = event.amount / 100;
      wallet.balance += amountPaid;
      wallet.transactions.unshift({
        type: "credit",
        amount: amountPaid,
        description: `Order #${order._id} - Monei webhook`,
      });
      await wallet.save();
    }

    // Send confirmation email
    try {
      const emailAddress = order.guestInfo?.email || order.customerInfo?.email;
      if (emailAddress) {
        await orderConfirmationEmail(
          emailAddress,
          "Your Chowspace Order Has Been Confirmed 🎉",
        );
      }
    } catch (err) {
      console.error("Email failed:", err);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Monei webhook error:", err.message);
    return res.status(500).json({ success: false, message: "Webhook error" });
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
      "totalAmount vendorId guestInfo items",
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

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
  initializeMoneiPayment,
  verifyMoneiPayment,
  moneiWebhook,
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  getManagerOrders,
  cleanupPendingOrders,
  getAllOrdersForAdmin,
  priceConfirmation,
};
