const Vendor = require("../models/vendor");

const getInAppChatStatus = async (req, res) => {
  try {
    const { vendorId } = req.params;

    const vendor = await Vendor.findById(vendorId).select("inAppChat");

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    res.status(200).json({
      success: true,
      inAppChat: Boolean(vendor.inAppChat),
    });
  } catch (err) {
    console.error("getInAppChatStatus error:", err.message);
    res.status(500).json({
      success: false,
      message: "Could not read the chat preference",
    });
  }
};

const updateInAppChat = async (req, res) => {
  try {
    // Resolved from the token, not the URL. The param named the vendor
    // outright, so any signed-in account could switch another store's chat
    // preference and change where its customers were sent.
    const vendorId = req.vendorId;
    const { inAppChat } = req.body;

    if (typeof inAppChat !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "inAppChat must be a boolean",
      });
    }

    const vendor = await Vendor.findById(vendorId);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    vendor.inAppChat = inAppChat;
    await vendor.save();

    res.status(200).json({
      success: true,
      message: "Chat preference updated.",
      data: vendor,
    });
  } catch (err) {
    console.error("updateInAppChat error:", err.message);
    res.status(500).json({
      success: false,
      message: "Could not update the chat preference",
    });
  }
};

module.exports = { getInAppChatStatus, updateInAppChat };
