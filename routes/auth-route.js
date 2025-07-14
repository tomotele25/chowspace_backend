const express = require("express");
const { login, signup } = require("../controller/auth-controller");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 100,
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

router.post("/auth/user/signup", registerLimiter, signup);
router.post("/auth/user/login", loginLimiter, login);

module.exports = router;
