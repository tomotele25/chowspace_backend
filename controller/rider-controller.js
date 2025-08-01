const Rider = require("../models/rider");
const Vendor = require("../models/vendor");
const bcrypt = require("bcrypt");
const User = require("../models/user");
const createVendorRider = async (req, res) => {
  try {
    const { fullname, plateNo, contact, password, vendor, email } = req.body;
    // const vendor = await Vendor.findOne({ user: req.user._id });

    if (!vendor) {
      return res
        .status(403)
        .json({ success: false, message: "Only vendors can create Riders" });
    }

    const existingRider = await Rider.findOne({ contact });

    if (existingRider) {
      return res.status(400).json({
        success: false,
        message: "Rider with this credentials exists",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      fullname,
      contact,
      email,
      password: hashedPassword,
      role: "rider",
    });
    await newUser.save();

    const newRider = new Rider({
      fullname,
      contact,
      plateNo,
      email,
      password: hashedPassword,
      vendor,
    });

    await newRider.save();

    res
      .status(200)
      .json({ success: true, newRider, message: "Rider created successfully" });
  } catch (error) {
    console.log("Error creating Rider", error.message);
  }
};

const getVendorRiders = async (req, res) => {
  try {
    const { vendorId } = req.params.vendorId;

    const riders = await Rider.findOne(vendorId);
    if (!riders) {
      return res
        .status(400)
        .json({ success: false, message: "Rider not found for this vendor " });
    }

    res
      .status(200)
      .json({ success: true, riders, message: "Rider fetched successfully" });
  } catch (error) {
    console.log("Error fetching Rider", error.message);
    res.status(500).json({ success: false, message: "Server Error " });
  }
};

module.exports = { createVendorRider, getVendorRiders };
