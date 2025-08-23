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
  priceConfirmation,
} = require("../controller/order-controller");

const auth = require("../middleware/auth");

const router = express.Router();

//Order Routes
router.post("/orders", createOrder);

// Payment (Paystack)
router.post("/init-payment", initializePaystackPayment);
router.post("/verifyPayment", verifyPaystackPayment);

// Order Management
router.get("/getAllOrders", getAllOrders);
router.get("/order/:orderId", getOrderById);
router.put("/order/:orderId", updateOrderStatus);

//  Manager Orders
router.get("/manager/orders", auth, getManagerOrders);
router.get("/confirm/:orderId", priceConfirmation);
// Cleanup old pending orders
router.delete("/cleanupPendingOrders", cleanupPendingOrders);

module.exports = router;
