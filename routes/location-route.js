const express = require("express");
const router = express.Router();

const {
  createVendorLocation,
  getVendorLocations,
  deleteVendorLocation,
} = require("../controller/vendorLocation-controller");
const auth = require("../middleware/auth");
router.post("/createVendorLocation", auth, createVendorLocation);
router.get("/locations/:vendorId", getVendorLocations);
router.delete("/locations/:id", deleteVendorLocation);

module.exports = router;
