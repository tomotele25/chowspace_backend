const Customer = require("../models/customer");
const User = require("../models/user");
const getAllCustomers = async (req, res) => {
  try {
    const customers = await User.find({ role: "customer" });
    if (!customers) {
      return res
        .status(400)
        .json({ success: false, message: "Customers not found" });
    }

    res
      .status(200)
      .json({ success: true, message: "Customers fetched successfully" });
  } catch (error) {
    console.error("Unable to fetch customers", error.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = getAllCustomers;
