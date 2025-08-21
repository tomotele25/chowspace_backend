require("dotenv").config();
const bcrypt = require("bcrypt");
const User = require("../models/user");
const jwt = require("jsonwebtoken");
const Vendor = require("../models/vendor");
const { sendSignupEmail } = require("../mailer");

const signup = async (req, res) => {
  const { fullname, contact, email, password } = req.body;

  try {
    if (!fullname || !contact || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const newUser = new User({
      fullname,
      contact,
      email,
      password: hashedPassword,
    });

    await newUser.save();
    try {
      await sendSignupEmail(email, fullname);
    } catch (err) {
      console.error("Email failed:", err);
    }
    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: {
        id: newUser._id,
        fullname: newUser.fullname,
        email: newUser.email,
        contact: newUser.contact,
      },
    });
  } catch (error) {
    console.error("Signup error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required" });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid credentials" });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid credentials" });
  }

  // Fetch vendor data if user is a vendor
  let vendorData = {};
  if (user.role === "vendor") {
    const vendor = await Vendor.findOne({ user: user._id });
    if (vendor) {
      vendorData = {
        vendorId: vendor._id,
        businessName: vendor.businessName,
        location: vendor.location,
        address: vendor.address,
        contact: vendor.contact,
        paymentPreference: vendor.paymentPreference,
      };
    }
  }

  const accessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "2d",
  });

  return res.status(200).json({
    success: true,
    accessToken,
    user: {
      id: user._id,
      fullname: user.fullname,
      email: user.email,
      role: user.role,
      ...vendorData,
    },
  });
};

module.exports = { signup, login };
