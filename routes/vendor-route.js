const express = require("express");
const router = express.Router();
const {
  createVendor,
  getAllVendor,
  getVendorBySlug,
  getVendorStatus,
  toggleVendorStatus,
} = require("../controller/vendor-controller");
const protect = require("../middleware/auth");
router.post("/vendor/create", createVendor);
router.get("/vendor/getVendors", getAllVendor);
router.get("/vendor/:slug", getVendorBySlug);
router.get("/getVendorStatus/:vendorId", getVendorStatus);
router.put("/vendor/toggleStatus", protect, toggleVendorStatus);

module.exports = router;
