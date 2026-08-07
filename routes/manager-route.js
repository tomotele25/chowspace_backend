const express = require("express");
const router = express.Router();
const {
  createManager,
  getManagers,
  getManagersWithStatus,
  updateProfile,
  getManagerByVendorId,
} = require("../controller/manager-controller");
const { requireRole } = require("../middleware/requireRole");

const vendorOnly = requireRole("vendor");

router.post("/createManager", vendorOnly, createManager);
router.get("/getManagers", vendorOnly, getManagers);

// Was unauthenticated, and the controller sets `manager.password` from the
// body — anyone holding a manager's user id could take the account over.
//
// Both roles legitimately reach it: a manager editing their own profile
// (pages/manager/Profile.jsx) and a vendor managing their team. The guard
// can't tell those apart, so the controller checks ownership.
router.put(
  "/manager/update/:managerId",
  requireRole("vendor", "manager"),
  updateProfile,
);

router.get("/getManagerWithStatus", vendorOnly, getManagersWithStatus);

// Mapped any vendorId to its manager's user id with no token, which is the
// lookup that made the takeover above trivial. Both the vendor and manager
// location pages call it.
router.get(
  "/getManagerByVendorId",
  requireRole("vendor", "manager"),
  getManagerByVendorId,
);

module.exports = router;
