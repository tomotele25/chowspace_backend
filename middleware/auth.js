// middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Manager = require("../models/manager");
const Vendor = require("../models/vendor");
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.role === "manager") {
      const manager = await Manager.findOne({ user: user._id });
      if (manager) {
        user.vendorId = manager.vendor;
      }
    }
    if (user.role === "vendor") {
      const vendor = await Vendor.findOne({ user: user._id });
      if (vendor) {
        user.vendorId = vendor.vendor;
      }
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = authMiddleware;
