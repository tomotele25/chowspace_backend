const mongoose = require("mongoose");

const UserSchema = mongoose.Schema({
  fullname: { type: String, required: true },
  email: { type: String, required: true },
  businessName: { type: String, required: true },
  password: { type: String, required: true },
});

module.exports = mongoose.model("User", UserSchema);
