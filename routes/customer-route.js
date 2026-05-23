const express = require("express");
const router = express.Router();
const {
  getOrderHistoryByCustomer,
  getAllCustomersWithUserDetails,
  saveBirthday,
  getAllCustomers
} = require("../controller/customer-controller");

router.get("/orderHistory/:customerId", getOrderHistoryByCustomer);
router.get("/customers", getAllCustomersWithUserDetails);
router.post("/customers/birthday", saveBirthday);
router.post("/customerDetails",getAllCustomers)

module.exports = router;