const express = require("express");
const router = express.Router();
const {
  getOrderHistoryByCustomer,
  getAllCustomersWithUserDetails,
} = require("../controller/customer-controller");

router.get("/orderHistory/:customerId", getOrderHistoryByCustomer);
router.get("/customers", getAllCustomersWithUserDetails);
module.exports = router;
