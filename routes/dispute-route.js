const express = require("express");
const router = express.Router();
const {
  createOrderDispute,
  getVendorDisputes,
  getDisputeReasons,
} = require("../controller/dispute-controller");
const { requireRole } = require("../middleware/requireRole");

// Was open — anyone could file a dispute against any order id.
router.post("/create-dispute", requireRole("customer"), createOrderDispute);

// Was guarded by `isVendor`, which never checked the role: a customer token
// left `vendorId` undefined and the query matched orders with no vendor field
// rather than returning 403.
router.get(
  "/get-disputes",
  requireRole("vendor", "manager"),
  getVendorDisputes,
);

router.get("/dispute/reasons", getDisputeReasons);

module.exports = router;
