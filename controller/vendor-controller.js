require("dotenv").config();
const Vendor = require("../models/vendor");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
// Register Our Vendor

const registerVendor = async (req, res) => {
  try {
    const {
      fullname,
      businessName,
      email,
      password,
      phoneNumber,
      location,
      address,
      image,
      category,
    } = req.body;

    // Validate required fields
    if (
      !fullname ||
      !businessName ||
      !email ||
      !password ||
      !phoneNumber ||
      !location
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Fullname, Business Name, Email, Password, Phone Number, and Location are required.",
      });
    }

    const existingVendor = await Vendor.findOne({ email });
    if (existingVendor) {
      return res.status(400).json({
        success: false,
        message: "Vendor already exist",
      });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create the new vendor
    const newVendor = new Vendor({
      fullname,
      businessName,
      email,
      password: hashedPassword,
      phoneNumber,
      location,
      address: address || "",
      image: image || "",
      category: category || "",
    });

    await newVendor.save();

    res.status(201).json({
      success: true,
      message: "Vendor created successfully",
      vendor: {
        id: newVendor._id,
        fullname: newVendor.fullname,
        businessName: newVendor.businessName,
        email: newVendor.email,
        phoneNumber: newVendor.phoneNumber,
        location: newVendor.location,
        address: newVendor.address,
        image: newVendor.image,
        category: newVendor.category,
      },
    });
  } catch (error) {
    console.error("Error creating vendor:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Lets Login our vendor
const loginVendor = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required ",
      });
    }

    const vendor = await Vendor.findOne({ email });
    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Invalid Credentials" });
    }

    const isPasswordMatched = await bcrypt.compare(password, vendor.password);
    if (!isPasswordMatched) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Credentials" });
    }
    const payload = { email, password };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "2d",
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      vendor: {
        id: vendor._id,
        fullname: vendor.fullname,
        businessName: vendor.businessName,
        email: vendor.email,
        location: vendor.location,
      },
    });
  } catch (error) {
    console.error("Error logging in vendor:", error.message);
    res.status(500).json({ success: false, message: "server error" });
  }
};

module.exports = { registerVendor, loginVendor };
