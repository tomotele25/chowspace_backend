const mongoose = require("mongoose");
const customerSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
  },
  fullname: String,
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
  },
});

module.exports = mongoose.model("Customer", customerSchema);
