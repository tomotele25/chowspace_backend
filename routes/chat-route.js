const express = require("express");
const router = express.Router();
const Message = require("../models/message");
const { getMessages, getVendorChatRooms } = require("../controller/chat");
const upload = require("../middleware/upload");
const rateLimit = require("express-rate-limit");
const {
  requireRole,
  attachUserIfPresent,
} = require("../middleware/requireRole");

/**
 * Chat can't require a login on the customer side: most customers order as
 * guests and have no account. So the token is optional, and what it changes is
 * what a message is allowed to claim about itself.
 */

const Order = require("../models/order");

/**
 * Which vendor a room belongs to.
 *
 * Rooms are named `vendor_<vendorId>` or `order_<orderId>`
 * (see api/server.js), so the vendor is either in the name or one lookup away.
 */
async function vendorForRoom(roomId) {
  if (!roomId) return null;

  if (roomId.startsWith("vendor_")) {
    return roomId.slice("vendor_".length) || null;
  }

  if (roomId.startsWith("order_")) {
    const order = await Order.findOne({
      orderId: roomId.slice("order_".length),
    }).select("vendorId");
    return order?.vendorId ? String(order.vendorId) : null;
  }

  return null;
}

/** True when the caller is staff of the store that owns this room. */
async function speaksForVendor(req, roomId) {
  if (!req.user) return false;
  if (req.user.role !== "vendor" && req.user.role !== "manager") return false;
  if (!req.vendorId) return false;

  const roomVendor = await vendorForRoom(roomId);
  return Boolean(roomVendor) && String(roomVendor) === String(req.vendorId);
}

// A vendor's list of conversations — staff only, and only their own.
router.get(
  "/chat/vendor/:vendorId",
  requireRole("vendor", "manager"),
  getVendorChatRooms,
);

router.post("/chat/:roomId/message", attachUserIfPresent, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { text, sender, vendorId, orderId, fileUrl, fileName } = req.body;

    if (!roomId || !sender || (!text && !fileUrl)) {
      return res
        .status(400)
        .json({ error: "roomId, sender, and text or fileUrl are required." });
    }

    // senderType used to be taken from the body. Combined with the route
    // being open, that let anyone post a message that rendered as if the
    // vendor had sent it — which is how a forged payment request carrying
    // someone else's account number could reach a customer. It is now
    // derived from the token, so speaking as the vendor requires being that
    // vendor, in that vendor's room.
    const senderType = (await speaksForVendor(req, roomId))
      ? "vendor"
      : "customer";

    const message = await Message.create({
      roomId,
      text: text || "",
      sender,
      senderType,
      vendorId: vendorId || null,
      orderId: orderId || null,
      fileUrl: fileUrl || null,
      fileName: fileName || null,
    });

    return res.status(201).json({ success: true, message });
  } catch (err) {
    console.error("POST /api/chat/:roomId/message error:", err.message);
    return res.status(500).json({ error: "Failed to save message." });
  }
});

// Reading a thread. `vendor_<id>` rooms are the vendor's inbox and are staff
// only; `order_<id>` rooms belong to a single order and stay reachable by the
// guest who placed it, for whom the order id is the only credential there is.
router.get("/chat/:roomId", attachUserIfPresent, getMessages);

/**
 * Chat attachments — usually a customer photographing a transfer receipt.
 *
 * Cannot demand a login: the customer is normally a guest. But it was open to
 * anonymous callers with no size limit and no type filter, which made it free
 * unbounded storage in our Cloudinary account, serving arbitrary files from a
 * URL under our domain.
 *
 * Three things close that without shutting guests out: the caller must be
 * either staff or attached to a real order, the file must be an image under
 * 5MB (middleware/upload.js), and the route is rate limited.
 */
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { status: 429, error: "Too many uploads. Please wait a few minutes." },
});

const mustBelongSomewhere = async (req, res, next) => {
  if (req.user) return next(); // signed-in staff or customer

  // A guest has to name an order that exists. It is a weak credential, but it
  // ties every anonymous upload to a real order rather than to nobody.
  const orderId = req.query.orderId || req.body?.orderId;
  if (!orderId) {
    return res
      .status(401)
      .json({ error: "Sign in, or attach this to one of your orders." });
  }

  const exists = await Order.exists({ orderId: String(orderId) });
  if (!exists) {
    return res.status(404).json({ error: "That order doesn't exist." });
  }
  next();
};

router.post(
  "/upload",
  uploadLimiter,
  attachUserIfPresent,
  mustBelongSomewhere,
  (req, res) => {
    upload.single("file")(req, res, (err) => {
      if (err) return uploadError(err, res);
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
      }
      return res.status(200).json({
        url: req.file.path,
        filename: req.file.originalname,
      });
    });
  },
);

module.exports = router;
