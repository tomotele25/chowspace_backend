const express = require("express");
const router = express.Router();
const {
  createOrderDispute,
  getVendorDisputes,
} = require("../controller/dispute-controller");

const protect = require("../middleware/isVendor");

router.post("/create-dispute", createOrderDispute);
router.get("/get-disputes", protect, getVendorDisputes);

module.exports = router;
