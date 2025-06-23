const Customer = require("../models/customer");
const bcrypt = require("bcrypt");

const signupCustomer = async (req, res) => {
  try {
    const { fullname, email, password } = req.body;

    if (!fullname || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existing = await Customer.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Customer already exists" });
    }

    const hash = await bcrypt.hash(password, 10);

    const newCustomer = new Customer({
      fullname,
      email,
      password: hash,
    });

    await newCustomer.save();

    res.status(201).json({
      success: true,
      message: "Customer registered",
      customer: {
        id: newCustomer._id,
        fullname: newCustomer.fullname,
        email: newCustomer.email,
      },
    });
  } catch (error) {
    console.error("Error signing up customer:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { signupCustomer };
