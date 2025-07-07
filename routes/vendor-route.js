const express = require("express");
const router = express.Router();
const {
  createVendor,
  getAllVendor,
  getVendorBySlug,
  getVendorStatus,
  toggleVendorStatus,
  updateVendorProfile,
  getTotalCountOfVendor,
  getVendorWallet,
} = require("../controller/vendor-controller");
const upload = require("../middleware/upload");
const protectVendor = require("../middleware/isVendor");
const protect = require("../middleware/auth");

router.post("/vendor/create", createVendor);
router.get("/vendor/vendorTotalCount", getTotalCountOfVendor);
router.get("/vendor/getVendors", getAllVendor);
router.get("/vendor/:slug", getVendorBySlug);
router.get("/getVendorStatus/:vendorId", getVendorStatus);
router.get("/getVendorWallet", protectVendor, getVendorWallet);
router.put("/vendor/toggleStatus", protect, toggleVendorStatus);
router.put(
  "/vendor/profile/update",
  protectVendor,
  upload.single("logo"),
  updateVendorProfile
);
module.exports = router;
