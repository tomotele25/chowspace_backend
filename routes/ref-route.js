const express = require("express");
const rateLimit = require("express-rate-limit");
const { recordClick, recordInstall } = require("../controller/ref-controller");

const router = express.Router();

// Public tracking beacons, hit from every landing page and every PWA
// install — generous but bounded so the endpoint can't be used to spam
// ReferralEvent rows.
const refLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { status: 429, error: "Too many requests." },
});

router.post("/ref/click", refLimiter, recordClick);
router.post("/ref/install", refLimiter, recordInstall);

module.exports = router;
