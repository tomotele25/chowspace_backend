const mongoose = require("mongoose");

const connectToDb = async (delay = 3000) => {
  while (true) {
    try {
      await mongoose.connect(process.env.DB_URL);
      console.log("✅ MongoDB connected successfully");
      break;
    } catch (error) {
      console.error("❌ MongoDB connection failed:", error.message);
      console.log(`🔁 Retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

module.exports = connectToDb;
