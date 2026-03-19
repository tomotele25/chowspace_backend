require("dotenv").config();
const express = require("express");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const connectToDb = require("../database/db");
const Message = require("../models/message");

// Routes
const authRoute = require("../routes/auth-route");
const vendorRoute = require("../routes/vendor-route");
const productRoute = require("../routes/product-route");
const managerRoute = require("../routes/manager-route");
const orderRoute = require("../routes/order-router");
const locationRoute = require("../routes/location-route");
const disputeRoute = require("../routes/dispute-route");
const supportRoute = require("../routes/support-route");
const customerRoute = require("../routes/customer-route");
const announcementRoute = require("../routes/announcement-route");
const adminRoute = require("../routes/admin-route");
const chatRoute = require("../routes/chat-route");

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 2005;
const server = http.createServer(app);

const allowedOrigins = [
  "http://localhost:3000",
  "https://chowspace.ng",
  "https://www.chowspace.ng",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Origin not allowed"));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());

/* ==============================
   🔥 SOCKET.IO
============================== */
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  /* ── Join order room ──────────────────────────────────────
     Customer calls this when they have a specific order.
     roomId becomes: order_CS-123456
  ───────────────────────────────────────────────────────── */
  socket.on("joinOrderRoom", (orderId) => {
    if (!orderId) return;
    socket.join(`order_${orderId}`);
    console.log(`${socket.id} joined order_${orderId}`);
  });

  /* ── Join vendor room ─────────────────────────────────────
     Customer calls this when chatting before/without an order.
     Vendor dashboard also calls this to receive all messages.
     roomId becomes: vendor_68ab15eecf07663d86d566b4
  ───────────────────────────────────────────────────────── */
  socket.on("joinVendorRoom", (vendorId) => {
    if (!vendorId) return;
    socket.join(`vendor_${vendorId}`);
    console.log(`${socket.id} joined vendor_${vendorId}`);
  });

  /* ── Send message ─────────────────────────────────────────
     Payload from client:
     {
       roomId:     "vendor_68ab..." | "order_CS-123456"
       text:       "Hello, is jollof available?"
       sender:     "Tunde"              ← customer display name
       senderType: "customer"           ← or "vendor"
       vendorId:   "68ab15eecf..."      ← always include
       orderId:    "CS-123456" | null   ← include if order exists
       fileUrl:    null | "https://..."
       fileName:   null | "receipt.pdf"
     }
  ───────────────────────────────────────────────────────── */
  socket.on("sendMessage", async (data) => {
    const {
      roomId,
      text,
      sender,
      senderType,
      vendorId,
      orderId,
      fileUrl,
      fileName,
    } = data;

    // Guard — need at minimum a room, a sender name, and content
    if (!roomId || !sender || (!text && !fileUrl)) return;

    const payload = {
      roomId,
      sender, // string name e.g. "Tunde"
      senderType: senderType || "customer",
      text: text || "",
      fileUrl: fileUrl || null,
      fileName: fileName || null,
      vendorId: vendorId || null,
      orderId: orderId || null,
    };

    // ✅ Persist to MongoDB
    try {
      const saved = await Message.create(payload);
      payload._id = saved._id;
      payload.createdAt = saved.createdAt;
    } catch (e) {
      console.error("❌ Failed to save message:", e.message);
      // Still broadcast even if save fails — don't block the chat
    }

    // ✅ Broadcast to everyone in the room (both customer + vendor)
    io.to(roomId).emit("receiveMessage", payload);

    // ✅ If this is an order room, also ping the vendor's room
    //    so their dashboard badge updates
    if (vendorId && roomId.startsWith("order_")) {
      io.to(`vendor_${vendorId}`).emit("newChatNotification", {
        roomId,
        orderId,
        sender,
        preview: text?.slice(0, 80) || "📎 File",
        time: payload.createdAt || new Date(),
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);
  });
});

/* ==============================
   🚦 RATE LIMITERS
============================== */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    status: 429,
    error: "Too many auth requests. Please try again later.",
  },
});

const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: {
    status: 429,
    error: "Too many order requests. Please try again shortly.",
  },
});

/* ==============================
   🧪 HEALTH CHECK
============================== */
app.get("/", (req, res) => res.send("🚀 Chowspace API running..."));

/* ==============================
   🚀 START
============================== */
const startServer = async () => {
  try {
    await connectToDb();

    app.use("/api/auth", authLimiter);
    app.use("/api/orders", orderLimiter);

    app.use("/api", authRoute);
    app.use("/api", vendorRoute);
    app.use("/api", productRoute);
    app.use("/api", managerRoute);
    app.use("/api", orderRoute);
    app.use("/api", locationRoute);
    app.use("/api", disputeRoute);
    app.use("/api", supportRoute);
    app.use("/api", customerRoute);
    app.use("/api", announcementRoute);
    app.use("/api", adminRoute);
    app.use("/api", chatRoute);

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ DB connection failed:", error.message);
    process.exit(1);
  }
};

startServer();

module.exports = { app, server, io };
