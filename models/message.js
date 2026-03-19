const mongoose = require("mongoose");

// This schema matches EXACTLY what the socket sendMessage handler saves
// Fields: roomId, sender (string name), senderType, text, vendorId, orderId, fileUrl, fileName

const messageSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      index: true,
      // Format: "vendor_<vendorId>" or "order_<orderId>"
    },

    sender: {
      type: String,
      required: true,
      trim: true,
      // The display name of who sent the message e.g. "Tunde"
    },

    senderType: {
      type: String,
      enum: ["customer", "vendor", "support", "manager", "admin"],
      default: "customer",
    },

    text: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },

    fileUrl: {
      type: String,
      default: null,
    },

    fileName: {
      type: String,
      default: null,
    },

    // Store vendorId so vendor dashboard can query all their chat rooms
    vendorId: {
      type: String,
      default: null,
      index: true,
    },

    // Store orderId if this chat is linked to a specific order
    orderId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

// Fast lookup: all messages in a room sorted by time
messageSchema.index({ roomId: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
