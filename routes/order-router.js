const express = require("express");
const router = express.Router();
const {
  createOrder,
  verifyPaymentAndCreateOrder,
  chargeBankAccount,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  getManagerOrders,
} = require("../controller/order-controller");

router.post("/orders", createOrder);
router.post("/verify-payment", verifyPaymentAndCreateOrder);
router.post("/charge-bank", chargeBankAccount);
router.get("/orders", getAllOrders);
router.get("/orders/:orderId", getOrderById);
router.put("/orders/:orderId/status", updateOrderStatus);
router.get("/manager/orders", getManagerOrders);

module.exports = router;
