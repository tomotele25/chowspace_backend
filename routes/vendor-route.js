const express = require("express");
const {
  loginVendor,
  registerVendor,
} = require("../controller/vendor-controller");

const router = express.Router();

router.post("/auth/vendor/register", registerVendor);
router.post("/auth/vendor/login", loginVendor);

module.exports = router;
