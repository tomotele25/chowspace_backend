require("dotenv").config();
const express = require("express");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const jwt = require("jsonwebtoken");

const connectToDb = require("../database/db");
const Message = require("../models/message");
const User = require("../models/user");
const Vendor = require("../models/vendor");
const Manager = require("../models/manager");

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
  "http://localhost:8081",
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

// Ahead of express.json(): QStash signs the raw bytes of a job delivery, so
// that route parses its own body and must not be pre-parsed here.
app.use("/api", require("../routes/job-route"));

app.use(express.json());

/* ==============================
   🔥 SOCKET.IO
============================== */
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
});

app.set("io", io);

/**
 * Optional handshake authentication.
 *
 * The socket carries the same risk the REST chat route did: `senderType` used
 * to come from the payload, so anyone could emit a message that rendered as
 * the vendor — including a payment request with their own account number.
 * Guarding the REST route alone would have left that wide open here.
 *
 * It cannot *require* a token: customers order as guests and have no account.
 * So a token is read when present and used only to grant more — speaking as
 * the vendor, and joining a vendor's room. No token means treated as a
 * customer, which is the safe default.
 */
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("role");
    if (!user) return next();

    if (user.role === "vendor") {
      const vendor = await Vendor.findOne({ user: user._id }).select("_id");
      if (vendor) socket.data.vendorId = String(vendor._id);
    } else if (user.role === "manager") {
      const manager = await Manager.findOne({ user: user._id }).select(
        "vendor",
      );
      if (manager?.vendor) socket.data.vendorId = String(manager.vendor);
    }
    socket.data.role = user.role;
  } catch {
    // A bad token is treated as no token — the connection still works, it just
    // gets the anonymous experience.
  }
  next();
});

/** True when this socket is staff of the given store. */
const socketSpeaksForVendor = (socket, vendorId) =>
  Boolean(socket.data.vendorId) &&
  String(socket.data.vendorId) === String(vendorId);

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
    // Staff only. A vendor room carries every conversation that store has,
    // and vendor ids are public from the storefront listing — so without this
    // anyone could subscribe to a competitor's live customer traffic.
    // Customers use order rooms; they never join here.
    if (!socketSpeaksForVendor(socket, vendorId)) {
      console.warn(`${socket.id} refused vendor_${vendorId}`);
      return;
    }
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

    // Derived from the handshake, not the payload. Taking it from the client
    // is what let a stranger post a message that looked like the vendor's own
    // — the mechanism behind a forged payment request carrying someone else's
    // bank account. Claiming to be the vendor now requires being that vendor.
    const resolvedSenderType = socketSpeaksForVendor(
      socket,
      vendorId || roomId.replace(/^vendor_/, ""),
    )
      ? "vendor"
      : "customer";

    const payload = {
      roomId,
      sender, // string name e.g. "Tunde"
      senderType: resolvedSenderType,
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
   📄 PRIVACY POLICY
   Public page required by app store review — linked from the mobile app's
   Profile screen and entered as the Privacy Policy URL in App Store Connect
   / Play Console.
============================== */
app.get("/privacy", (req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chowspace Privacy Policy</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #1a1a1a; }
  h1 { font-size: 24px; }
  h2 { font-size: 18px; margin-top: 32px; }
  .updated { color: #666; font-size: 14px; }
</style>
</head>
<body>
<h1>Chowspace Privacy Policy</h1>
<p class="updated">Last updated: August 5, 2026</p>

<p>Chowspace ("we", "us", "our") operates the Chowspace mobile app, which connects customers with local food, pharmacy, mall, and drinks vendors for ordering. This policy explains what information we collect through the app, why we collect it, and how it's used.</p>

<h2>Information we collect</h2>
<p><strong>Account information.</strong> When you create an account, we collect your full name, email address, phone number, and password (stored securely, never in plain text). This is used to identify you, let you log in, and let vendors contact you about your orders.</p>
<p><strong>Location information.</strong> You choose a delivery area from a fixed list of supported locations (e.g. Abeokuta, Yaba, Ikeja) so we can show you vendors that deliver there. At checkout, you also provide a specific delivery address as free text. We do not collect your device's precise GPS location — location in this app is a manual selection and a typed address, not continuous tracking.</p>
<p><strong>Order information.</strong> When you place an order, we collect the items ordered, quantities, prices, delivery method, delivery address, and phone number, so the order can be prepared and delivered.</p>
<p><strong>Chat messages and images.</strong> If you contact a vendor through in-app chat, we store the text messages and any images you choose to send, so the conversation history is available to you and the vendor for that order.</p>
<p><strong>Payment-related information.</strong> For orders paid through our payment partner (Monei), we do not collect or store your card or bank account details — payment is handled by generating a one-time virtual bank account for the transfer. For orders placed with Abeokuta-based vendors, checkout redirects to WhatsApp, where your conversation with the vendor is subject to WhatsApp's own privacy policy, not this one.</p>

<h2>How we use this information</h2>
<ul>
  <li>To create and manage your account</li>
  <li>To process and deliver your orders</li>
  <li>To let you communicate with vendors about an order</li>
  <li>To show you vendors and delivery options relevant to your selected area</li>
  <li>To respond to support requests</li>
</ul>
<p>We do not sell your personal information to third parties.</p>

<h2>Who we share information with</h2>
<ul>
  <li><strong>Vendors</strong> you order from receive your name, phone number, delivery address, and order details, so they can fulfill your order.</li>
  <li><strong>Monei</strong>, our payment processing partner, receives the information necessary to generate a payment account for orders you choose to pay for that way.</li>
  <li>We may disclose information if required by law.</li>
</ul>

<h2>Data retention</h2>
<p>We retain account and order information for as long as your account is active, and as needed to resolve disputes or comply with legal obligations.</p>

<h2>Your choices</h2>
<p>You can update your profile information within the app. You can permanently delete your account and associated profile data at any time from Profile → Delete account. You can also reach us at tomotelechristopher25@gmail.com with any privacy questions.</p>

<h2>Children's privacy</h2>
<p>Chowspace is not directed at children under 13, and we do not knowingly collect information from children under 13.</p>

<h2>Changes to this policy</h2>
<p>We may update this policy from time to time. Material changes will be reflected by updating the "Last updated" date above.</p>

<h2>Contact us</h2>
<p>Questions about this policy or your data can be sent to tomotelechristopher25@gmail.com.</p>
</body>
</html>`);
});

/* ==============================
   🆘 SUPPORT
   Public page required for the App Store Connect "Support URL" field.
============================== */
app.get("/support", (req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chowspace Support</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #1a1a1a; }
  h1 { font-size: 26px; }
  h2 { font-size: 17px; margin-top: 28px; }
  a { color: #AE2108; }
  .card { background: #F7F7F7; border-radius: 12px; padding: 16px 20px; margin-top: 12px; }
</style>
</head>
<body>
<h1>Chowspace Support</h1>
<p>Need help with an order, your account, or the app? We're happy to help.</p>

<h2>Contact us</h2>
<div class="card">
  <p><strong>Email:</strong> <a href="mailto:tomotelechristopher25@gmail.com">tomotelechristopher25@gmail.com</a></p>
  <p>We typically respond within 24–48 hours.</p>
</div>

<h2>In the app</h2>
<p>You can also reach us directly from the app: open the <strong>Support</strong> tab to raise a ticket about an order, or use in-app chat to message a vendor about an active order.</p>

<h2>Account help</h2>
<p>To update your profile, log out, or permanently delete your account and data, go to <strong>Profile</strong> in the app.</p>

<h2>Privacy</h2>
<p>See our <a href="/privacy">Privacy Policy</a> for details on how we handle your data.</p>
</body>
</html>`);
});

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
