const express = require("express");
const router = express.Router();
const {
  createVendor,
  getAllVendor,
  getVendorBySlug,
  toggleVendorStatus,
} = require("../controller/vendor-controller");

router.post("/vendor/create", createVendor);
router.get("/vendor/getVendors", getAllVendor);
router.get("/vendor/:slug", getVendorBySlug);
router.put("/vendor/toggleStatus", toggleVendorStatus);

module.exports = router;
