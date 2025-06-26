require("dotenv").config();
const express = require("express");
const app = express();
const PORT = 2005;
const connectToDb = require("../database/db");
const cors = require("cors");
const authRoute = require("../routes/auth-route");
const vendorRoute = require("../routes/vendor-route");
const productRoute = require("../routes/product-route");
const managerRoute = require("../routes/manager-route");
const orderRoute = require("../routes/order-router");
const startServer = async () => {
  connectToDb();
  app.listen(PORT, () => {
    console.log(`app is running on port : ${PORT}`);
  });
};

const allowedOrigins = [
  "http://localhost:3000",
  "https://chowspace.vercel.app",
];

app.use(express.json());

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

app.use("/api", authRoute);
app.use("/api", vendorRoute);
app.use("/api", productRoute);
app.use("/api", managerRoute);
app.use("/api", orderRoute);
app.get("/", (req, res) => {
  console.log("test reached");
  res.send("Hello world!");
});
startServer();
module.exports = app;
