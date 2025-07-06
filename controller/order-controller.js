const Flutterwave = require("flutterwave-node-v3");
const axios = require("axios");
const Order = require("../models/order");
const Vendor = require("../models/vendor");

const flw = new Flutterwave(
  process.env.FLW_PUBLIC_KEY,
  process.env.FLW_SECRET_KEY
);

// 1. Init payment & create pending order
const initializeFlutterwavePayment = async (req, res) => {
  try {
    const { amount, email, vendorId, tx_ref, orderPayload } = req.body;

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
        message: "Vendor not found or missing subaccount",
      });
    }

    // Save order with pending status
    const newOrder = new Order({
      ...orderPayload,
      vendorId,
      paymentStatus: "pending",
      paymentRef: tx_ref,
    });
    await newOrder.save();

    const paymentPayload = {
      tx_ref,
      amount,
      currency: "NGN",
      redirect_url: "https://chowspace.vercel.app/Payment-Redirect",
      customer: { email },
      subaccounts: [
        {
          id: vendor.subaccountId,
          transaction_charge_type: "flat",
          transaction_charge: 100,
        },
      ],
    };

    const response = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      paymentPayload,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).json({
      success: true,
      message: "Payment initialized and order saved",
      paymentLink: response.data.data.link,
    });
  } catch (error) {
    console.error("Init error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Failed to initialize payment",
    });
  }
};

const verifyFlutterwavePayment = async (req, res) => {
  const { reference } = req.body;

  if (!reference) {
    return res.status(400).json({
      success: false,
      message: "Missing payment reference.",
    });
  }

  try {
    const result = await flw.Transaction.verify({ id: reference });

    const isVerified =
      result.status === "success" &&
      result.data.status === "successful" &&
      result.data.currency === "NGN";

    if (!isVerified) {
      return res.status(400).json({
        success: false,
        message: "❌ Payment verification failed or was incomplete.",
        flutterwaveResponse: result,
      });
    }

    const order = await Order.findOne({ paymentRef: reference });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found for this payment reference.",
      });
    }

    order.paymentStatus = "paid";
    order.paymentReference = reference;
    await order.save();

    return res.status(200).json({
      success: true,
      message: "✅ Payment verified and order updated.",
      order,
    });
  } catch (error) {
    console.error(
      "Payment verification error:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      success: false,
      message: "Server error during payment verification.",
      error: error.message,
    });
  }
};

const chargeBankAccount = async (req, res) => {
  const {
    account_bank,
    account_number,
    amount,
    email,
    phone_number,
    fullname,
    tx_ref,
  } = req.body;

  if (
    !account_bank ||
    !account_number ||
    !amount ||
    !email ||
    !phone_number ||
    !fullname
  ) {
    return res
      .status(400)
      .json({ message: "Missing required bank charge fields." });
  }

  try {
    const payload = {
      tx_ref: tx_ref || `CHOW-${Date.now()}`,
      amount,
      account_bank,
      account_number,
      currency: "NGN",
      email,
      phone_number,
      fullname,
      redirect_url: "http://chowspace.vercel.app/Payment-Redirect",
    };

    const response = await flw.Charge.account(payload);

    if (response.status === "success") {
      return res.status(200).json({
        success: true,
        message: "Bank account charge initiated.",
        data: response.data,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Bank account charge failed.",
        data: response,
      });
    }
  } catch (err) {
    console.error("Bank charge error:", err.response?.data || err.message);
    return res.status(500).json({
      message: "Bank charge failed.",
      error: err.message,
    });
  }
};

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

    const orders = await Order.find({ vendorId }).sort({ createdAt: -1 });

    return res.status(200).json({ success: true, orders });
  } catch (err) {
    console.error("Error fetching manager orders:", err);
    return res
      .status(500)
      .json({ message: "Failed to fetch orders for manager." });
  }
};

module.exports = {
  createOrder,
  verifyPaymentAndCreateOrder,
  chargeBankAccount,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  initializeFlutterwavePayment,
  getManagerOrders,
  verifyFlutterwavePayment,
};
