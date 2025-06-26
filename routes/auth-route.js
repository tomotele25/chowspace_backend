const express = require("express");
const { login, signup } = require("../controller/auth-controller");
const router = express.Router();

router.post("/auth/user/signup", signup);
router.post("/auth/user/login", login);

module.exports = router;
