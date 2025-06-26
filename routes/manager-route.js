const express = require("express");
const router = express.Router();
const {
  createManager,
  getManagers,
  getManagerVendor,
} = require("../controller/manager-controller");
const protect = require("../middleware/auth");

router.post("/createManager", protect, createManager);
router.get("/getManagers", protect, getManagers);
router.get("/getVendorByManager/:managerId", getManagerVendor);
module.exports = router;
