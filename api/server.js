require("dotenv").config();
const express = require("express");
const app = express();
const PORT = 2005;
const connectToDb = require("../database/db");
const vendorRoute = require("../routes/vendor-route");
const cors = require("cors");

const startServer = async () => {
  connectToDb();
  app.listen(PORT, () => {
    console.log(`app is running on port : ${PORT}`);
  });
};

const allowedOrigins = [
  "http://localhost:3000",
  "https://rightminds-academy-risy.vercel.app",
  "https://rightminds-academy-risy",
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

app.use("/api", vendorRoute);

startServer();
module.exports = app;
