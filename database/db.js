require("dotenv").config();
const mongoose = require("mongoose");

let isConnected = false;

const connectToDb = async () => {
  if (isConnected) return;

  if (mongoose.connection.readyState >= 1) {
    isConnected = true;
    return;
  }

  try {
    await mongoose.connect(process.env.DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    isConnected = true;
    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    throw err;
  }
};

module.exports = connectToDb;
