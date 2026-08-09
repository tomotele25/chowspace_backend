const express = require("express");
const {
  login,
  signup,
  verifyEmail,
  resendVerification,
} = require("../controller/auth-controller");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const loginLimiter = rateLimit({
  // Was `1 * 60 * 100` — six seconds, not sixty. The window reset before the
  // limit ever bit, so five attempts every six seconds was 3,000 an hour from
  // a single IP. The two limiters below always used `* 1000`, which is what
  // made the typo hard to see on review.
  windowMs: 1 * 60 * 1000,
  max: 5,
  message: {
    status: 429,
    error: "Too many login attempts. Please try again after a minute.",
  },
});

const registerLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 3,
  message: {
    status: 429,
    error: "Too many registration attempts. Please wait and try again.",
  },
});

// Clicked from an email, so it redirects to a page rather than returning JSON.
router.get("/auth/verify-email", verifyEmail);

// Tighter than registration — this one sends mail on every call.
const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: {
    status: 429,
    error: "Too many requests. Please wait a few minutes and try again.",
  },
});

router.post("/auth/user/signup", registerLimiter, signup);
router.post("/auth/user/login", loginLimiter, login);
router.post("/auth/resend-verification", resendLimiter, resendVerification);

module.exports = router;
