const express = require("express");
const router = express.Router();
const Message = require("../models/message"); // ← ADD THIS
const { getMessages, getVendorChatRooms } = require("../controller/chat");
const upload = require("../middleware/upload");


router.get("/chat/vendor/:vendorId", getVendorChatRooms);


router.post("/chat/:roomId/message", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { text, sender, senderType, vendorId, orderId, fileUrl, fileName } =
      req.body;

    if (!roomId || !sender || (!text && !fileUrl)) {
      return res
        .status(400)
        .json({ error: "roomId, sender, and text or fileUrl are required." });
    }

    const message = await Message.create({
      roomId,
      text: text || "",
      sender,
      senderType: senderType || "customer",
      vendorId: vendorId || null,
      orderId: orderId || null,
      fileUrl: fileUrl || null,
      fileName: fileName || null,
    });

    return res.status(201).json({ success: true, message });
  } catch (err) {
    console.error("POST /api/chat/:roomId/message error:", err);
    return res.status(500).json({ error: "Failed to save message." });
  }
});


router.get("/chat/:roomId", getMessages);

router.post("/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    return res.status(200).json({
      url: req.file.path, 
      filename: req.file.originalname,
    });
  } catch (err) {
    console.error("POST /api/upload error:", err);
    return res.status(500).json({ error: "Upload failed." });
  }
});

module.exports = router;
