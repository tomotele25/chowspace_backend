const express = require("express");
const router = express.Router();
const {
  getLocation,
  createLocation,
} = require("../controller/location-controller");
const {
  createVendorLocation,
  getVendorLocations,
  deleteVendorLocation,
  getVendorLocationsByManager,
  updateVendorLocations,
  getPlatformLocations,
  createLocationByVendor,
  syncVendorLocationsToPlatform,
  getVendorPackingFee,
} = require("../controller/vendorLocation-controller");
const { requireRole } = require("../middleware/requireRole");

const storeStaff = requireRole("vendor", "manager");

/* Vendor delivery zones — the prices customers are charged, so writes are
   staff-only and scoped to the caller's own store. Deleting a zone and
   updating the price list were both open to anonymous callers, which meant
   anyone could set any vendor's delivery fee to zero. */
router.post("/createVendorLocation", storeStaff, createVendorLocation);
router.post("/locations", storeStaff, createLocationByVendor);
router.delete("/locations/:id", storeStaff, deleteVendorLocation);
router.put("/locations/:managerId", storeStaff, updateVendorLocations);

/* Public reads — the storefront needs these to quote delivery before anyone
   has logged in. */
router.get("/locations/:vendorId", getVendorLocations);
router.get("/getLocations", getLocation);
router.get("/platform-locations", getPlatformLocations);
router.get("/packing-fee/:vendorId", getVendorPackingFee);

router.get(
  "/locations/manager/:managerId",
  storeStaff,
  getVendorLocationsByManager,
);

/* Platform-wide location list — admin only. */
router.post("/createLocation", requireRole("admin"), createLocation);

/* A GET that writes: it creates PlatformLocation rows. Admin-only until it
   becomes a POST, which is a separate change. */
router.get(
  "/sync-locations",
  requireRole("admin"),
  syncVendorLocationsToPlatform,
);

module.exports = router;
