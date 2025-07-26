require("dotenv").config();
const express = require("express");
const rateLimit = require("express-rate-limit");
const app = express();
app.set("trust proxy", 1); // Trust first proxy

const PORT = 2005;
const connectToDb = require("../database/db");
const cors = require("cors");

// Import routes
const authRoute = require("../routes/auth-route");
const vendorRoute = require("../routes/vendor-route");
const productRoute = require("../routes/product-route");
const managerRoute = require("../routes/manager-route");
const orderRoute = require("../routes/order-router");
const locationRoute = require("../routes/location-route");
const disputeRoute = require("../routes/dispute-route");
const supportRoute = require("../routes/support-route");
const customerRoute = require("../routes/customer-route");
// Allowed CORS origins
const allowedOrigins = ["http://localhost:3000", "https://chowspace.ng"];

// CORS setup
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Origin not allowed"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    status: 429,
    error: "Too many auth requests. Please try again later.",
  },
});

const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: {
    status: 429,
    error: "Too many order fetches. Please try again shortly.",
  },
});

app.get("/", (req, res) => {
  console.log("Test route hit");
  res.send("Hello world!");
});

const startServer = async () => {
  try {
    await connectToDb();

    app.use("/api/auth", authLimiter);
    app.use("/api/orders", orderLimiter);

    app.use("/api", authRoute);
    app.use("/api", vendorRoute);
    app.use("/api", productRoute);
    app.use("/api", managerRoute);
    app.use("/api", orderRoute);
    app.use("/api", locationRoute);
    app.use("/api", disputeRoute);
    app.use("/api", supportRoute);
    app.use("/api", customerRoute);

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ DB connection failed:", error.message);
    process.exit(1);
  }
};

startServer();

module.exports = app;
