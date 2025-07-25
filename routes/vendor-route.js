const express = require("express");
const router = express.Router();
const {
  createVendor,
  getAllVendor,
  getVendorBySlug,
  getVendorStatus,
  toggleVendorStatus,
  getVendorStatusById,
  updateVendorProfile,
  getTotalCountOfVendor,
  rateVendor,
  getVendorWallet,
  initPromotePayment,
  verifyPromotePayment,
} = require("../controller/vendor-controller");
const upload = require("../middleware/upload");
const protectVendor = require("../middleware/isVendor");
const protect = require("../middleware/auth");
const verifyCustomer = require("../middleware/customers");
router.post("/vendor/create", createVendor);
router.get("/vendor/vendorTotalCount", getTotalCountOfVendor);
router.get("/vendor/getVendors", getAllVendor);
router.get("/vendor/:slug", getVendorBySlug);
router.get("/getVendorStatus", protect, getVendorStatus);
router.get("/getVendorStatusById/:vendorId", getVendorStatusById);

router.get("/getVendorWallet", protectVendor, getVendorWallet);
router.put("/vendor/toggleStatus", protect, toggleVendorStatus);
router.put(
  "/vendor/profile/update",
  protectVendor,
  upload.single("logo"),
  updateVendorProfile
);
router.post("/rateVendor", verifyCustomer, rateVendor);
router.post("/paystack/init-promote", initPromotePayment);
router.post("/paystack/verify-promote", verifyPromotePayment);

module.exports = router;
