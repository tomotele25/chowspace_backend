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

const { requireRole } = require("../middleware/requireRole");

const router = express.Router();

// Managers work the order queue alongside the vendor.
const storeStaff = requireRole("vendor", "manager");

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

// Order management.
//
// All three were open. `getAllOrders` with no vendorId query returned every
// order on the platform with customer names, phones and addresses;
// `updateOrderStatus` let anyone mark any order paid. They are now scoped to
// the store the token belongs to — the vendorId query param is ignored.
router.get("/getAllOrders", storeStaff, getAllOrders);
router.get("/order/:orderId", storeStaff, getOrderById);
router.put("/order/:orderId", storeStaff, updateOrderStatus);

// Manager Orders
router.get("/manager/orders", requireRole("manager"), getManagerOrders);

// Public by design: the customer receives this link over WhatsApp and has no
// account. What it returns is trimmed rather than gated.
router.get("/confirm/:orderId", priceConfirmation);

router.get("/getAllOrdersForAdmin", requireRole("admin"), getAllOrdersForAdmin);

// Consider wiring this to a scheduled job (cron / Vercel cron) rather
// than leaving it importable-but-unmounted — it's currently dead code.
// router.get("/orders/cleanup", cleanupPendingOrders);

module.exports = router;
