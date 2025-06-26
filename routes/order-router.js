const express = require("express");
const router = express.Router();
const {
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  getManagerOrders,
} = require("../controller/order-controller");
const auth = require("../middleware/auth");
router.post("/orders", createOrder);
router.get("/getAllOrders", getAllOrders);
router.get("order/:orderId", getOrderById);
router.put("order/:orderId", updateOrderStatus);
router.get("/manager/orders", auth, getManagerOrders);

module.exports = router;
