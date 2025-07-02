const Location = require("../models/location");

const createLocation = async (req, res) => {
  try {
    const { location, price } = req.body;
    const existingLocation = await Location.findOne({ location });
    if (existingLocation) {
      return res
        .status(400)
        .json({ success: false, message: "Location Already exists " });
    }

    const newLocation = new Location({
      location,
      price,
    });

    await newLocation.save();

    res
      .status(200)
      .json({ success: true, message: "Location created successfully" });
  } catch (error) {
    console.log("Unable to create location:", error.message);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

module.exports = createLocation;
