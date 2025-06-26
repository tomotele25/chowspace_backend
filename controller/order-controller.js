const Order = require("../models/order");

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
    res
      .status(200)
      .json({ success: true, orders, message: "Orders fetched successfully" });
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
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  getManagerOrders,
};
