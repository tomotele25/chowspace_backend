const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Customer = require("../models/customer");

const customerAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user || user.role !== "customer") {
      return res.status(403).json({ message: "Access denied. Customer only." });
    }

    const customer = await Customer.findOne({ user: user._id });

    if (!customer) {
      return res.status(404).json({ message: "Customer not found." });
    }

    // Attach user and customerId to the request
    req.user = user;
    req.customerId = customer._id;

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

module.exports = customerAuth;
