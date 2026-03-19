const Message = require("../models/message");

/* ============================================================
   GET /api/chat/:roomId
   Fetches all messages for a room, oldest first.
   Called by Chat.jsx on load to show history.

   roomId examples:
     vendor_68ab15eecf07663d86d566b4   ← general vendor chat
     order_CS-123456                   ← order-specific chat
============================================================ */
const getMessages = async (req, res) => {
  try {
    const { roomId } = req.params;

    if (!roomId) {
      return res.status(400).json({ error: "roomId is required." });
    }

    const messages = await Message.find({ roomId })
      .sort({ createdAt: 1 }) // oldest first so UI renders top → bottom
      .lean();

    return res.status(200).json({ success: true, messages });
  } catch (err) {
    console.error("getMessages error:", err);
    return res.status(500).json({ error: "Failed to fetch messages." });
  }
};

/* ============================================================
   GET /api/chat/vendor/:vendorId
   Fetches all DISTINCT rooms (chat threads) for a vendor.
   Used on the vendor dashboard to list all customer chats.
============================================================ */
const getVendorChatRooms = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!vendorId) {
      return res.status(400).json({ error: "vendorId is required." });
    }

    // Get the latest message per room for preview
    const rooms = await Message.aggregate([
      { $match: { vendorId } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$roomId",
          lastMessage: { $first: "$text" },
          lastSender: { $first: "$sender" },
          lastTime: { $first: "$createdAt" },
          orderId: { $first: "$orderId" },
          unreadCount: {
            $sum: {
              $cond: [{ $ne: ["$senderType", "vendor"] }, 1, 0],
            },
          },
        },
      },
      { $sort: { lastTime: -1 } },
    ]);

    return res.status(200).json({ success: true, rooms });
  } catch (err) {
    console.error("getVendorChatRooms error:", err);
    return res.status(500).json({ error: "Failed to fetch chat rooms." });
  }
};

module.exports = { getMessages, getVendorChatRooms };
