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
  getVendorPackingFee
} = require("../controller/vendorLocation-controller");
const auth = require("../middleware/auth");
const vendorAuthMiddleware = require("../middleware/vendor");
router.post("/createVendorLocation", auth, createVendorLocation);
router.get("/locations/:vendorId", getVendorLocations);
router.delete("/locations/:id", deleteVendorLocation);
router.post("/createLocation", createLocation);
router.get("/getLocations", getLocation);
router.get("/locations/manager/:managerId", getVendorLocationsByManager);
router.put("/locations/:managerId", updateVendorLocations);
router.get("/sync-locations", syncVendorLocationsToPlatform);
router.get("/platform-locations", getPlatformLocations);
router.post("/locations", vendorAuthMiddleware, createLocationByVendor);



router.get("/packing-fee/:vendorId", getVendorPackingFee);

module.exports = router;
