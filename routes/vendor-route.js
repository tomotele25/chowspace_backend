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
  getReviews,
  rateVendor,
  getVendorWallet,
  initPromotePayment,
  verifyPromotePayment,
  updateStoreHours,
  getOpeningHours,
  autoToggleStatus,
} = require("../controller/vendor-controller");
const {
  createVendorRider,
  getVendorRiders,
} = require("../controller/rider-controller");

const bothRole = require("../middleware/bothRole");
const upload = require("../middleware/upload");
const protectVendor = require("../middleware/isVendor");
const protect = require("../middleware/auth");
const verifyCustomer = require("../middleware/customers");
router.post("/vendor/create", createVendor);
router.get("/vendor/vendorTotalCount", getTotalCountOfVendor);
router.get("/vendor/getVendors", getAllVendor);
router.get("/vendor/:slug", getVendorBySlug);
router.get("/vendor/:vendorId/opening-hours", bothRole, getOpeningHours);
router.get("/getVendorStatus", protect, getVendorStatus);
router.get("/getVendorStatusById/:vendorId", getVendorStatusById);
router.put("/:vendorId/update-hours", bothRole, updateStoreHours);
router.get("/getVendorWallet", protectVendor, getVendorWallet);
router.put("/vendor/toggleStatus", protect, toggleVendorStatus);
router.put(
  "/vendor/profile/update",
  protectVendor,
  upload.single("logo"),
  updateVendorProfile
);
router.put("/auto-toggleStatus/:vendorId", bothRole, autoToggleStatus);

router.post("/rateVendor", verifyCustomer, rateVendor);
router.post("/paystack/init-promote", initPromotePayment);
router.post("/paystack/verify-promote", verifyPromotePayment);
router.get("/vendor/:vendorId/reviews", getReviews);
router.get("/getVendorRiders/:vendorId", getVendorRiders);
router.get("/createRider", createVendorRider);

module.exports = router;

// router.post("/createRiderForVendor", createVendorRider);
