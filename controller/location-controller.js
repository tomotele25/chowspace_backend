const Location = require("../models/location");

const createLocation = async (req, res) => {
  try {
    const { location } = req.body;
    const existingLocation = await Location.findOne({ location });
    if (existingLocation) {
      return res
        .status(400)
        .json({ success: false, message: "Location Already exists " });
    }

    const newLocation = new Location({
      location,
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

const getLocation = async (req, res) => {
  try {
    const locations = await Location.find({}, { location: 1, _id: 0 });

    const locationNames = locations.map((loc) => loc.location);

    res.status(200).json({
      success: true,
      message: "Locations fetched successfully",
      locations: locationNames,
    });
  } catch (error) {
    console.error("Error fetching locations:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = { getLocation, createLocation };
