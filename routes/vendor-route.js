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

const upload = require("../middleware/upload");
const { requireRole } = require("../middleware/requireRole");
const {
  getBanks,
  verifyBankAccount,
  savePayoutAccount,
  getPayoutAccount,
} = require("../controller/bank-controller");
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
router.get(
  "/getVendorStatus",
  requireRole("vendor", "manager"),
  getVendorStatus,
);
router.get("/getVendorStatusById/:vendorId", getVendorStatusById);
router.get("/getVendorWallet", requireRole("vendor"), getVendorWallet);

/* ══════════════════════════════════════════
   Payout account — where a vendor's money is sent
   ══════════════════════════════════════════ */
router.get("/banks", requireRole("vendor", "manager"), getBanks);
router.post(
  "/vendor/payout-account/verify",
  requireRole("vendor"),
  verifyBankAccount,
);
router.post("/vendor/payout-account", requireRole("vendor"), savePayoutAccount);

/* ══════════════════════════════════════════
   Verification
   ══════════════════════════════════════════ */
// Vendor-facing — available throughout review, so they can keep setting up.
router.get(
  "/vendor/verification/status",
  requireRole("vendor", "manager"),
  getVerificationStatus,
);
router.post(
  "/vendor/verification/documents",
  requireRole("vendor", "manager"),
  uploadDocuments,
  uploadVerificationDocuments,
);

// Admin review queue.
router.get("/admin/verifications", requireRole("admin"), listVerifications);
router.patch(
  "/admin/verifications/:vendorId",
  requireRole("admin"),
  decideVerification,
);
router.put(
  "/vendor/toggleStatus",
  requireRole("vendor", "manager"),
  toggleVendorStatus,
);
router.put(
  "/vendor/profile/update",
  requireRole("vendor"),
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "coverImages", maxCount: 2 },
  ]),
  updateVendorProfile,
);

router.post("/rateVendor", requireRole("customer"), rateVendor);
router.post(
  "/paystack/init-promote",
  requireRole("vendor"),
  initPromotePayment,
);
router.post(
  "/paystack/verify-promote",
  requireRole("vendor"),
  verifyPromotePayment,
);
router.get("/vendor/:vendorId/reviews", getReviews);

/* ══════════════════════════════════════════
   Customer chat preference (in-app vs WhatsApp)
   ══════════════════════════════════════════ */
router.get("/vendors/:vendorId/in-app-chat", getInAppChatStatus);
router.patch(
  "/vendors/:vendorId/in-app-chat",
  requireRole("vendor"),
  updateInAppChat,
);

/* ══════════════════════════════════════════
   Store hours
   ══════════════════════════════════════════ */
router.get("/vendor/:vendorId/opening-hours", getOpeningHours);
router.put("/vendor/update-hours", requireRole("vendor"), updateStoreHours);

/* ══════════════════════════════════════════
   Auto hours (open/close automatically + hard-close safety net)
   ══════════════════════════════════════════ */
router.get("/vendor/:vendorId/live-status", getLiveStoreStatus);
router.patch(
  "/vendor/:vendorId/auto-hours",
  requireRole("vendor"),
  setAutoHoursPreference,
);

// Cron-only — Vercel calls this on schedule, not the frontend
router.get("/cron/sync-store-status", syncAllVendorStatuses);

module.exports = router;
