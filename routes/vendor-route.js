const express = require("express");
const router = express.Router();
const {
  createVendor,
  getAllVendor,
  getVendorBySlug,
  getVendorStatus,
  toggleVendorStatus,
  updateVendorProfile,
} = require("../controller/vendor-controller");
const upload = require("../middleware/upload");
const protect = require("../middleware/auth");

router.post("/vendor/create", createVendor);
router.get("/vendor/getVendors", getAllVendor);
router.get("/vendor/:slug", getVendorBySlug);
router.get("/getVendorStatus/:vendorId", getVendorStatus);
router.put("/vendor/toggleStatus", protect, toggleVendorStatus);
router.put(
  "/vendor/profile/update",
  protect,
  upload.single("logo"),
  updateVendorProfile
);
module.exports = router;
