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
  getOpeningHours,
} = require("../controller/vendor-controller");

const {
  getInAppChatStatus,
  updateInAppChat,
} = require("../controller/FeatureToggleController");

const {

  updateStoreHours,
  getLiveStoreStatus,
  setAutoHoursPreference,
  syncAllVendorStatuses,
} = require("../controller/settings-controller");

const bothRole = require("../middleware/bothRole");
const upload = require("../middleware/upload");
const protectVendor = require("../middleware/isVendor");
const protect = require("../middleware/auth");
const verifyCustomer = require("../middleware/customers");
const adminAuth = require("../middleware/adminAuth");
const { uploadDocuments } = require("../middleware/documentUpload");
const {
  getVerificationStatus,
  uploadVerificationDocuments,
  listVerifications,
  decideVerification,
} = require("../controller/vendorVerification-controller");

/* ══════════════════════════════════════════
   Vendor — core
   ══════════════════════════════════════════ */
router.post("/vendor/create", createVendor);
router.get("/vendor/vendorTotalCount", getTotalCountOfVendor);
router.get("/vendor/getVendors", getAllVendor);
router.get("/vendor/:slug", getVendorBySlug);
router.get("/getVendorStatus", protect, getVendorStatus);
router.get("/getVendorStatusById/:vendorId", getVendorStatusById);
router.get("/getVendorWallet", protectVendor, getVendorWallet);

/* ══════════════════════════════════════════
   Verification
   ══════════════════════════════════════════ */
// Vendor-facing — available throughout review, so they can keep setting up.
router.get("/vendor/verification/status", protect, getVerificationStatus);
router.post(
  "/vendor/verification/documents",
  protect,
  uploadDocuments,
  uploadVerificationDocuments,
);

// Admin review queue.
router.get("/admin/verifications", adminAuth, listVerifications);
router.patch(
  "/admin/verifications/:vendorId",
  adminAuth,
  decideVerification,
);
router.put("/vendor/toggleStatus", protect, toggleVendorStatus);
router.put(
  "/vendor/profile/update",
  protectVendor,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "coverImages", maxCount: 2 },
  ]),
  updateVendorProfile,
);

router.post("/rateVendor", verifyCustomer, rateVendor);
router.post("/paystack/init-promote", initPromotePayment);
router.post("/paystack/verify-promote", verifyPromotePayment);
router.get("/vendor/:vendorId/reviews", getReviews);

/* ══════════════════════════════════════════
   Customer chat preference (in-app vs WhatsApp)
   ══════════════════════════════════════════ */
router.get("/vendors/:vendorId/in-app-chat", getInAppChatStatus);
router.patch("/vendors/:vendorId/in-app-chat", protectVendor, updateInAppChat);

/* ══════════════════════════════════════════
   Store hours
   ══════════════════════════════════════════ */
router.get("/vendor/:vendorId/opening-hours", bothRole, getOpeningHours);
router.put("/vendor/update-hours", protectVendor, updateStoreHours);

/* ══════════════════════════════════════════
   Auto hours (open/close automatically + hard-close safety net)
   ══════════════════════════════════════════ */
router.get("/vendor/:vendorId/live-status", getLiveStoreStatus);
router.patch(
  "/vendor/:vendorId/auto-hours",
  protectVendor,
  setAutoHoursPreference,
);

// Cron-only — Vercel calls this on schedule, not the frontend
router.get("/cron/sync-store-status", syncAllVendorStatuses);

module.exports = router;
