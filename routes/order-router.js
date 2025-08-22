const express = require("express");
const {
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  initializePaystackPayment,
  verifyPaystackPayment,
  getManagerOrders,
  cleanupPendingOrders,
  getOrdersForAdmin,
} = require("../controller/order-controller");

const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const router = express.Router();

//Order Routes
router.post("/orders", createOrder);

// Payment (Paystack)
router.post("/init-payment", initializePaystackPayment);
router.post("/verifyPayment", verifyPaystackPayment);

// Order Management2
router.get("/getAllOrders", getAllOrders);
router.get("/order/:orderId", getOrderById);
router.put("/order/:orderId", updateOrderStatus);
router.get("/getAllOrdersForAdmin", adminAuth, getAllOrders);
//  Manager Orders
router.get("/manager/orders", auth, getManagerOrders);

// Cleanup old pending orders
router.delete("/cleanupPendingOrders", cleanupPendingOrders);

module.exports = router;
