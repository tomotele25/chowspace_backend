const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
  fullname: {
    type: String,
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
  },
});

module.exports = mongoose.model("Customer", customerSchema);
