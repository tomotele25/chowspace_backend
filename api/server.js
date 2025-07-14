require("dotenv").config();
const express = require("express");
const rateLimit = require("express-rate-limit");
const app = express();
app.set("trust proxy", 1);
const PORT = 2005;
const connectToDb = require("../database/db");
const cors = require("cors");

const authRoute = require("../routes/auth-route");
const vendorRoute = require("../routes/vendor-route");
const productRoute = require("../routes/product-route");
const managerRoute = require("../routes/manager-route");
const orderRoute = require("../routes/order-router");
const locationRoute = require("../routes/location-route");
const disputeRoute = require("../routes/dispute-route");

const allowedOrigins = [
  "http://localhost:3000",
  "https://chowspace.vercel.app",
];

app.use(express.json());

// CORS setup
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Origin is not allowed"));
      }
    },
    credentials: true,
  })
);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    status: 429,
    error: "Too many requests from this IP. Please try again later.",
  },
});
app.use("/api", globalLimiter);

app.get("/", (req, res) => {
  console.log("test reached");
  res.send("Hello world!");
});

const startServer = async () => {
  try {
    await connectToDb();
    app.use("/api", authRoute);
    app.use("/api", vendorRoute);
    app.use("/api", productRoute);
    app.use("/api", managerRoute);
    app.use("/api", orderRoute);
    app.use("/api", locationRoute);
    app.use("/api", disputeRoute);

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
