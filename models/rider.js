const mongoose = require("mongoose");

const riderSchema = new mongoose.Schema({
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor",
  },
  fullname: {
    type: String,
    required: true,
  },
  contact: {
    type: String,
    required: true,
  },
  plateNo: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
});

module.exports = mongoose.model("Rider", riderSchema);
