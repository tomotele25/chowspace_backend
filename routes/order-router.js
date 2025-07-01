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
const auth = require("../middleware/auth");
router.post("/orders", createOrder);
router.post("/verify-payment", verifyPaymentAndCreateOrder);
router.post("/charge-bank", chargeBankAccount);
router.get("/getAllOrders", getAllOrders);
router.get("/order/:orderId", getOrderById);
router.put("/order/:orderId", updateOrderStatus);
router.get("/manager/orders", auth, getManagerOrders);

module.exports = router;
