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
} = require("../controller/vendorLocation-controller");
const auth = require("../middleware/auth");
router.post("/createVendorLocation", auth, createVendorLocation);
router.get("/locations/:vendorId", getVendorLocations);
router.delete("/locations/:id", deleteVendorLocation);
router.post("/createLocation", createLocation);
router.get("/getLocations", getLocation);
module.exports = router;
