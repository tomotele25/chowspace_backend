const express = require("express");
const router = express.Router();
const {
  getOrderHistoryByCustomer,
  getAllCustomersWithUserDetails,
  saveBirthday,
} = require("../controller/customer-controller");

router.get("/orderHistory/:customerId", getOrderHistoryByCustomer);
router.get("/customers", getAllCustomersWithUserDetails);
router.post("/customers/birthday", saveBirthday);

module.exports = router;
