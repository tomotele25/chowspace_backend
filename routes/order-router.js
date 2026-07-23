const express = require("express");
const {
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  getManagerOrders,
  cleanupPendingOrders,
  priceConfirmation,
  getAllOrdersForAdmin,
  initializeMoneiPayment,
  verifyMoneiPayment,
  moneiWebhook,
} = require("../controller/order-controller");

const auth = require("../middleware/auth");

const router = express.Router();
const adminAuth = require("../middleware/adminAuth");

// Order Routes
router.post("/orders", createOrder);

// Payment (Monei)
router.post("/payment/monei/initialize", initializeMoneiPayment);
router.post("/payment/monei/verify", verifyMoneiPayment);

// Webhook — MUST receive the raw body (not JSON-parsed) for HMAC
// signature verification. express.raw() here overrides express.json()
// for this route only, so the rest of the app is unaffected.
router.post(
  "/orders/monei/webhook",
  express.raw({ type: "application/json" }),
  moneiWebhook,
);

// Order Management
router.get("/getAllOrders", getAllOrders);
router.get("/order/:orderId", getOrderById);
router.put("/order/:orderId", updateOrderStatus);

// Manager Orders
router.get("/manager/orders", auth, getManagerOrders);
router.get("/confirm/:orderId", priceConfirmation);

// Cleanup old pending orders
router.get("/getAllOrdersForAdmin", adminAuth, getAllOrdersForAdmin);

// Consider wiring this to a scheduled job (cron / Vercel cron) rather
// than leaving it importable-but-unmounted — it's currently dead code.
// router.get("/orders/cleanup", cleanupPendingOrders);

module.exports = router;
