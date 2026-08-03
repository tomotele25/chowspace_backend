require("dotenv").config();
const axios = require("axios");
const Order = require("../models/order");
const Vendor = require("../models/vendor");
const Wallet = require("../models/wallet");
const { orderConfirmationEmail } = require("../mailer");
const Customer = require("../models/customer");
const crypto = require("crypto");

const { MoneiSDK, DepositMethodsEnum } = require("monei-sdk");

// FIX: SDK expects an options object with `apiKey`, not a bare string.
// Confirm which env var name is actually set on Vercel — MONEI_API_KEY
// or MONEI_SECRET_KEY — and make sure this line matches it exactly.
const monei = new MoneiSDK({ apiKey: process.env.MONEI_SECRET_KEY });

const Product = require("../models/product");
const { getEffectiveStatus } = require("../utils/Storehours");
const { isPubliclyVisible } = require("../utils/vendorVisibility");

/**
 * Refuses an order when the vendor's store is shut.
 *
 * Nothing enforced this before — "closed" was decorative on the backend, and
 * a customer who loaded a menu at 8:59pm could still submit at 9:05pm. Now
 * that every vendor runs on a schedule that actually closes them, this is what
 * makes closing time mean something.
 *
 * Returns a response when it rejects, or null when the order may proceed.
 */
const rejectIfClosed = async (vendorId, res) => {
  const vendor = await Vendor.findById(vendorId).select(
    "businessName status openingHours timezone useAutoHours statusOverride verificationStatus logo",
  );

  if (!vendor) {
    return res
      .status(404)
      .json({ success: false, message: "Vendor not found" });
  }

  // Not verified, or storefront incomplete — they shouldn't have been
  // reachable at all, so this is a backstop against a stale page or a
  // hand-crafted request.
  const productCount = await Product.countDocuments({ vendor: vendor._id });
  if (!isPubliclyVisible(vendor, productCount)) {
    return res.status(409).json({
      success: false,
      code: "VENDOR_NOT_LIVE",
      message: `${vendor.businessName} isn't accepting orders yet.`,
    });
  }

  if (getEffectiveStatus(vendor) !== "opened") {
    return res.status(409).json({
      success: false,
      code: "VENDOR_CLOSED",
      message: `${vendor.businessName} is closed right now and can't take orders.`,
    });
  }

  return null;
};

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

    // Guard the paid path too — this creates a pending order, so skipping the
    // check here would let a customer pay a store that is closed or not yet live.
    const blocked = await rejectIfClosed(vendorId, res);
    if (blocked) return blocked;

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

    // FIX: deposit method is a separate first argument (the enum),
    // not a field nested inside the options object.
    // NOTE: Monei's amount field is already in naira (not kobo) — confirmed
    // by the "exceeds ₦50,000 limit" error that only makes sense if a
    // ₦2,400 charge was being sent as ₦240,000 via a ×100 conversion.
    const deposit = await monei.deposit.initializeDeposit(
      DepositMethodsEnum.BANK_TRANSFER,
      {
        amount: Number(amount), // naira, as-is — no kobo conversion
        reference: tx_ref,
        currency: "NGN",
        narration: `Order ${pendingOrder._id} — ${vendor.businessName}`,
      },
    );

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
  } catch (error) {
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

    // FIX: atomic find-and-update guarded on paymentStatus not already
    // being "paid" — prevents a race with the webhook double-crediting
    // the vendor wallet if both land around the same time.
    const order = await Order.findOneAndUpdate(
      { paymentRef: reference, paymentStatus: { $ne: "paid" } },
      { $set: { paymentStatus: "paid" } },
      { new: false }, // returns the PRE-update doc, or null if no match
    );

    if (!order) {
      // Either the order doesn't exist, or it was already marked paid
      // by the webhook — figure out which so we return the right response.
      const existing = await Order.findOne({ paymentRef: reference });
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }
      return res.status(200).json({
        success: true,
        message: "Payment already verified",
        order: existing,
      });
    }

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
      const amountPaid = depositStatus.amount; // already in naira
      wallet.balance += amountPaid;
      wallet.transactions.unshift({
        type: "credit",
        amount: amountPaid,
        description: `Order #${order._id} - Payment via Monei`,
      });
      await wallet.save();
    }

    order.paymentStatus = "paid"; // already set in DB; keeps returned object in sync
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

// FIX: this route MUST be mounted with express.raw() before express.json()
// in server.js, e.g.:
//   app.post("/api/orders/monei/webhook", express.raw({ type: "application/json" }), moneiWebhook);
// so req.body arrives as a raw Buffer for HMAC verification below.
// Confirm the exact header name + signing scheme against docs.monei.cc's
// webhooks page — "monei-signature" and MONEI_WEBHOOK_SECRET are placeholders.
const moneiWebhook = async (req, res) => {
  try {
    const signature = req.headers["monei-signature"];
    const webhookSecret = process.env.MONEI_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
      console.error("Monei webhook: missing signature or webhook secret");
      return res.status(401).json({ received: false });
    }

    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.body) // raw Buffer — see note above
      .digest("hex");

    const sigBuf = Buffer.from(signature, "utf8");
    const expBuf = Buffer.from(expected, "utf8");

    if (
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      console.error("Monei webhook: invalid signature");
      return res.status(401).json({ received: false });
    }

    const event = JSON.parse(req.body.toString("utf8"));

    if (event.status !== "COMPLETED" && event.status !== "SUCCESS") {
      return res.status(200).json({ received: true });
    }

    const reference = event.reference;

    // FIX: same atomic guard as verifyMoneiPayment, so whichever of
    // (client verify call / webhook) arrives first "wins" and the
    // other becomes a safe no-op instead of double-crediting the wallet.
    const order = await Order.findOneAndUpdate(
      { paymentRef: reference, paymentStatus: { $ne: "paid" } },
      { $set: { paymentStatus: "paid" } },
      { new: false },
    );

    if (!order) {
      return res.status(200).json({ received: true }); // not found, or already paid
    }

    // 👉 Credit vendor wallet
    const wallet = await Wallet.findOne({ vendorId: order.vendorId });
    if (wallet) {
      const amountPaid = event.amount; // already in naira
      wallet.balance += amountPaid;
      wallet.transactions.unshift({
        type: "credit",
        amount: amountPaid,
        description: `Order #${order._id} - Monei webhook`,
      });
      await wallet.save();
    }

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
    const closed = await rejectIfClosed(vendorId, res);
    if (closed) return closed;

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
