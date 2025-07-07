const express = require("express");
const {
  createOrder,
  chargeBankAccount,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  initializeFlutterwavePayment,
  getManagerOrders,
  verifyPaymentAndCreateOrder,
} = require("../controller/order-controller");

const auth = require("../middleware/auth");

const router = express.Router();

router.post("/orders", createOrder);
router.post("/verify-payment", verifyPaymentAndCreateOrder);
router.post("/charge-bank", chargeBankAccount);

router.post("/init-payment", initializeFlutterwavePayment);

router.get("/getAllOrders", getAllOrders);
router.get("/order/:orderId", getOrderById);
router.put("/order/:orderId", updateOrderStatus);
router.get("/manager/orders", auth, getManagerOrders);

module.exports = router;
