require("dotenv").config();
const axios = require("axios");
const Order = require("../models/order");
const Vendor = require("../models/vendor");
const Wallet = require("../models/wallet");
const { enqueueEmail } = require("../queues/email");
const { creditVendorForOrder } = require("../utils/creditVendor");
const { priceOrder } = require("../utils/pricing");
const { payoutVendorForOrder } = require("../utils/moneiPayout");
const Customer = require("../models/customer");
const Influencer = require("../models/influencer");
const crypto = require("crypto");
const { getRedis } = require("../queues/redis");
const { enqueueWhatsapp } = require("../queues/whatsapp");
const { normalizePhone } = require("../utils/phone");

const { MoneiSDK, DepositMethodsEnum } = require("monei-sdk");

// FIX: SDK expects an options object with `apiKey`, not a bare string.
// Confirm which env var name is actually set on Vercel — MONEI_API_KEY
// or MONEI_SECRET_KEY — and make sure this line matches it exactly.
const monei = new MoneiSDK({ apiKey: process.env.MONEI_SECRET_KEY });

const Product = require("../models/product");
const { getEffectiveStatus } = require("../utils/Storehours");
const { isPubliclyVisible } = require("../utils/vendorVisibility");

/**
 * Refuses an order when the vendor's store is shut.
 *
 * Nothing enforced this before — "closed" was decorative on the backend, and
 * a customer who loaded a menu at 8:59pm could still submit at 9:05pm. Now
 * that every vendor runs on a schedule that actually closes them, this is what
 * makes closing time mean something.
 *
 * Returns a response when it rejects, or null when the order may proceed.
 */
const rejectIfClosed = async (vendorId, res) => {
  const vendor = await Vendor.findById(vendorId).select(
    "businessName status openingHours timezone useAutoHours statusOverride verificationStatus logo",
  );

  if (!vendor) {
    return res
      .status(404)
      .json({ success: false, message: "Vendor not found" });
  }

  // Not verified, or storefront incomplete — they shouldn't have been
  // reachable at all, so this is a backstop against a stale page or a
  // hand-crafted request.
  const productCount = await Product.countDocuments({ vendor: vendor._id });
  if (!isPubliclyVisible(vendor, productCount)) {
    return res.status(409).json({
      success: false,
      code: "VENDOR_NOT_LIVE",
      message: `${vendor.businessName} isn't accepting orders yet.`,
    });
  }

  if (getEffectiveStatus(vendor) !== "opened") {
    return res.status(409).json({
      success: false,
      code: "VENDOR_CLOSED",
      message: `${vendor.businessName} is closed right now and can't take orders.`,
    });
  }

  return null;
};

const initializeMoneiPayment = async (req, res) => {
  try {
    const {
      amount,
      email,
      vendorId,
      tx_ref,
      orderPayload,
      guestInfo,
      customerId,
    } = req.body;

    if (!amount || !email || !vendorId || !tx_ref || !orderPayload) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(400).json({
        success: false,
        message: "Vendor not found",
      });
    }

    // Guard the paid path too — this creates a pending order, so skipping the
    // check here would let a customer pay a store that is closed or not yet live.
    const blocked = await rejectIfClosed(vendorId, res);
    if (blocked) return blocked;

    // The last payment path that still took its amount from the browser.
    // Repriced here like the direct path, so what the customer is asked to
    // transfer is decided by our database.
    const { ok, error, priced } = await priceOrder({
      vendorId,
      items: orderPayload.items,
      deliveryLocation: orderPayload.deliveryLocation,
      packCount: orderPayload.packCount,
    });
    if (!ok) return res.status(400).json({ success: false, message: error });

    if (typeof amount === "number" && priced.total > amount) {
      return res.status(409).json({
        success: false,
        message:
          "Prices changed while you were ordering. Please review your cart.",
        total: priced.total,
      });
    }

    const newOrderData = {
      orderId: tx_ref,
      vendorId,
      items: priced.lines,
      deliveryMethod: orderPayload.deliveryMethod,
      deliveryLocation: orderPayload.deliveryLocation || null,
      note: orderPayload.note || "",
      itemsTotal: priced.itemsTotal,
      packFees: priced.packFees,
      deliveryFee: priced.deliveryFee,
      serviceFee: priced.serviceFee,
      totalAmount: priced.total,
      vendorShare: priced.vendorShare,
      paymentMethod: "monei",
      paymentRef: tx_ref,
      paymentStatus: "pending",
    };

    if (customerId) {
      newOrderData.customerId = customerId;
    } else if (guestInfo) {
      newOrderData.guestInfo = guestInfo;
    } else {
      return res.status(400).json({
        success: false,
        message: "No customer or guest info provided",
      });
    }

    const pendingOrder = await Order.create(newOrderData);

    // 👉 Add order to Customer's order list
    if (customerId) {
      await Customer.findOneAndUpdate(
        { user: customerId },
        { $push: { order: pendingOrder._id } },
        { new: true, upsert: true },
      );
    }

    // FIX: deposit method is a separate first argument (the enum),
    // not a field nested inside the options object.
    // NOTE: Monei's amount field is already in naira (not kobo) — confirmed
    // by the "exceeds ₦50,000 limit" error that only makes sense if a
    // ₦2,400 charge was being sent as ₦240,000 via a ×100 conversion.
    // `amount` here is what Chowspace must RECEIVE — the order total including
    // our service fee. Monei adds its own charge (a flat 2.2% at the time of
    // writing) and returns `totalAmount`, which is what the customer actually
    // transfers. Taking that figure from the response rather than computing it
    // means the customer is charged exactly right even if Monei changes its
    // pricing, and it is the customer who bears the processing fee.
    const deposit = await monei.deposit.initializeDeposit(
      DepositMethodsEnum.BANK_TRANSFER,
      {
        amount: priced.total, // naira, as-is — no kobo conversion
        reference: tx_ref,
        currency: "NGN",
        narration: `Order ${pendingOrder._id} — ${vendor.businessName}`,
      },
    );

    const customerPays = Number(deposit.totalAmount ?? deposit.amount);
    const providerFee = Number(deposit.moneiFee ?? 0);

    await Order.updateOne(
      { _id: pendingOrder._id },
      { $set: { moneiFee: providerFee } },
    );

    return res.status(200).json({
      success: true,
      message: "Payment initialized and order saved",
      orderId: pendingOrder._id,
      deposit: {
        reference: deposit.reference,
        accountNumber: deposit.accountNumber,
        bankName: deposit.bankName,
        accountName: deposit.accountName,
        // What to transfer. `orderTotal` and `providerFee` are broken out so
        // the chat can show why it is more than the basket.
        amount: customerPays,
        orderTotal: priced.total,
        providerFee,
        expiry_datetime: deposit.expiry_datetime,
        note: deposit.note,
        status: deposit.status,
      },
    });
  } catch (error) {
    console.error("Monei init error FULL:", error);
    console.error("Monei init error message:", error.message);
    console.error("Monei init error response:", error.response?.data);
    console.error("Monei init error stack:", error.stack);
    return res.status(500).json({
      success: false,
      message: "Failed to initialize payment",
    });
  }
};

const verifyMoneiPayment = async (req, res) => {
  const { reference } = req.body;

  try {
    const depositStatus = await monei.deposit.getStatus({ reference });

    if (
      depositStatus.status !== "COMPLETED" &&
      depositStatus.status !== "SUCCESS"
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment not yet confirmed",
        status: depositStatus.status,
      });
    }

    // FIX: atomic find-and-update guarded on paymentStatus not already
    // being "paid" — prevents a race with the webhook double-crediting
    // the vendor wallet if both land around the same time.
    const order = await Order.findOneAndUpdate(
      { paymentRef: reference, paymentStatus: { $ne: "paid" } },
      { $set: { paymentStatus: "paid" } },
      { new: false }, // returns the PRE-update doc, or null if no match
    );

    if (!order) {
      // Either the order doesn't exist, or it was already marked paid
      // by the webhook — figure out which so we return the right response.
      const existing = await Order.findOne({ paymentRef: reference });
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }
      return res.status(200).json({
        success: true,
        message: "Payment already verified",
        order: existing,
      });
    }

    // 👉 Send confirmation email
    try {
      const emailAddress = order.guestInfo?.email || order.customerInfo?.email;
      if (emailAddress) {
        // Queued: this runs inside the payment webhook, and the provider
        // retries the whole webhook if we answer slowly — which would credit
        // the wallet twice. Handing the email off keeps the response quick.
        await enqueueEmail({
          template: "order-confirmation",
          to: emailAddress,
          data: { subject: "Your Chowspace Order Has Been Confirmed 🎉" },
        });
      }
    } catch (err) {
      console.error("Email failed:", err);
    }

    // Credits the vendor and marks the order paid in one transaction, creating
    // the wallet if they have never been paid before. Credits vendorShare, so
    // Chowspace's service fee is not handed over with it.
    const credited = await creditVendorForOrder(order._id);

    // Then move it on to their bank straight away. Deliberately after the
    // transaction rather than inside it: a bank transfer is a call to another
    // company and can take seconds, and holding a database transaction open
    // across that would block writes on the order. If it fails the money stays
    // in their wallet — see utils/moneiPayout.js.
    if (credited.credited) {
      await payoutVendorForOrder(order._id);
    }

    order.paymentStatus = "paid"; // keeps the returned object in sync
    return res.status(200).json({
      success: true,
      message: "Payment verified",
      order,
    });
  } catch (err) {
    console.error("Monei verify error:", err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      message: "Internal error during payment verification",
    });
  }
};

/**
 * Monei calls this when a payment settles.
 *
 * Mounted with express.raw() ahead of express.json() so req.body is the exact
 * bytes Monei sent — see routes/order-router.js.
 *
 * The header is `x-monei-signature`, per docs.monei.cc/security/webhooks. The
 * previous code read `monei-signature`, which no request ever carries, so every
 * delivery was rejected as unsigned and no payment was ever confirmed by
 * webhook — leaving confirmation to depend entirely on the customer keeping
 * their browser open long enough to call verify.
 *
 * The secret comes from the Monei dashboard: Settings → Webhooks → Add
 * Webhook, then copy the secret it shows.
 */
const moneiWebhook = async (req, res) => {
  try {
    const signature =
      req.headers["x-monei-signature"] || req.headers["monei-signature"];
    // Monei's dashboard does not always issue a separate per-webhook secret,
    // and their docs don't say which credential signs the payload. Both
    // candidates are tried.
    //
    // This weakens nothing: an HMAC only verifies against the key that
    // produced it, so offering two keys cannot help anyone forge a signature
    // — it just means we recognise whichever one Monei used. Set
    // MONEI_WEBHOOK_SECRET once known and it takes precedence.
    const secrets = [
      process.env.MONEI_WEBHOOK_SECRET,
      process.env.MONEI_SECRET_KEY,
    ].filter(Boolean);

    if (!signature || secrets.length === 0) {
      console.error(
        "Monei webhook rejected:",
        secrets.length === 0
          ? "no signing credential configured — no payment can be confirmed by webhook"
          : "no x-monei-signature header",
      );
      return res.status(401).json({ received: false });
    }

    const raw = req.body.toString("utf8");

    // Monei's documented example signs JSON.stringify(payload) — the parsed
    // body re-serialised. That is normally byte-identical to what was sent,
    // but not if they ever pretty-print or we sit behind a proxy that
    // reformats. Both are accepted so a formatting difference cannot silently
    // reject real payments.
    const candidates = [raw];
    try {
      candidates.push(JSON.stringify(JSON.parse(raw)));
    } catch {
      // Unparseable body — the raw comparison below will fail it anyway.
    }

    const sigBuf = Buffer.from(String(signature), "utf8");
    let matchedWith = null;

    for (const secret of secrets) {
      for (const body of candidates) {
        const expBuf = Buffer.from(
          crypto.createHmac("sha256", secret).update(body).digest("hex"),
          "utf8",
        );
        if (
          sigBuf.length === expBuf.length &&
          crypto.timingSafeEqual(sigBuf, expBuf)
        ) {
          matchedWith =
            secret === process.env.MONEI_WEBHOOK_SECRET
              ? "MONEI_WEBHOOK_SECRET"
              : "MONEI_SECRET_KEY";
          break;
        }
      }
      if (matchedWith) break;
    }

    if (!matchedWith) {
      console.error("Monei webhook: invalid signature");
      return res.status(401).json({ received: false });
    }

    // Logged so the first real delivery tells us which credential Monei signs
    // with — the thing their documentation leaves out.
    console.log(`[monei] webhook verified using ${matchedWith}`);

    const event = JSON.parse(raw);

    if (event.status !== "COMPLETED" && event.status !== "SUCCESS") {
      return res.status(200).json({ received: true });
    }

    const reference = event.reference;

    const order = await Order.findOne({ paymentRef: reference }).select(
      "_id guestInfo customerInfo",
    );

    if (!order) {
      return res.status(200).json({ received: true }); // nothing to match
    }

    // Marking paid and crediting the vendor happen together, guarded by
    // walletCreditedAt. Previously the status was committed first and the
    // credit followed in a separate write: a failure in between returned 500,
    // this webhook was retried, the retry saw "already paid" and answered 200,
    // and the credit was lost permanently and silently.
    //
    // Whichever of the webhook and the client's verify call arrives first
    // wins; the other becomes a no-op rather than a second payment.
    const credited = await creditVendorForOrder(order._id);

    if (credited.credited) {
      await payoutVendorForOrder(order._id);
    }

    // 👉 Send confirmation email
    try {
      const emailAddress = order.guestInfo?.email || order.customerInfo?.email;
      if (emailAddress) {
        // Queued: this runs inside the payment webhook, and the provider
        // retries the whole webhook if we answer slowly — which would credit
        // the wallet twice. Handing the email off keeps the response quick.
        await enqueueEmail({
          template: "order-confirmation",
          to: emailAddress,
          data: { subject: "Your Chowspace Order Has Been Confirmed 🎉" },
        });
      }
    } catch (err) {
      console.error("Email failed:", err);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Monei webhook error:", err.message);
    return res.status(500).json({ success: false, message: "Webhook error" });
  }
};

const DAY_SECONDS = 86400;
const QUOTA_TTL_SECONDS = 2 * DAY_SECONDS;
const MARKETING_GAP_SECONDS = 14 * DAY_SECONDS;

/** yyyymmdd in UTC, for the rolling daily send quota key. */
function utcDateKey(d = new Date()) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Sends the courtesy WhatsApp message that follows an order — a warm note on a
 * customer's first order, a lighter one after that.
 *
 * Fire-and-forget and fully swallowed: messaging must never affect whether an
 * order is created. Every guard fails safe (missing config, no phone, opted
 * out, over quota) by simply not sending.
 *
 * There is deliberately no inactive / win-back path here. That is unsolicited
 * bulk messaging, which is what gets a WhatsApp number banned, and this runs
 * on the real business line.
 */
async function maybeSendOrderWhatsapp(order, vendorId) {
  try {
    if (process.env.WA_ENABLED !== "true") return;

    const phone = normalizePhone(
      order.customerInfo?.phone || order.guestInfo?.phone,
    );
    if (!phone) return;

    const redis = getRedis();
    if (!redis) return;

    // Lifetime non-cancelled order count. Seeded for existing customers by
    // scripts/seed-wa-redis.js so long-time regulars aren't greeted as new.
    const count = await redis.incr(`cust:orders:${phone}`);

    if (await redis.get(`wa:optout:${phone}`)) return;

    const template = count === 1 ? "wa-first-order" : "wa-returning";

    // Never repeat the first-order message; space anything else out by 14 days.
    if (await redis.get(`wa:sent:${phone}:${template}`)) return;
    if (template === "wa-returning" && (await redis.get(`wa:sent:${phone}:marketing`)))
      return;

    // Global daily cap — a blunt backstop against a bad loop or a spike.
    const quotaKey = `wa:quota:${utcDateKey()}`;
    const used = await redis.incr(quotaKey);
    if (used === 1) await redis.expire(quotaKey, QUOTA_TTL_SECONDS);
    const cap = Number(process.env.WA_DAILY_CAP || 60);
    if (used > cap) {
      console.warn(`[wa] daily cap ${cap} reached — skipping ${phone}`);
      return;
    }

    let vendorName = "";
    try {
      const vendor = await Vendor.findById(vendorId).select("businessName");
      vendorName = vendor?.businessName || "";
    } catch {
      /* name is optional in the copy */
    }

    const { queued } = await enqueueWhatsapp({
      template,
      to: phone,
      data: {
        name: (order.customerInfo?.name || order.guestInfo?.name || "").split(
          " ",
        )[0],
        vendorName,
        orderId: order.orderId,
      },
    });

    if (queued) {
      // Mark optimistically. The worker re-checks and re-marks on real send;
      // worst case a transient publish that never delivered suppresses one
      // future message, which is the safe direction to fail.
      if (template === "wa-first-order") {
        await redis.set(`wa:sent:${phone}:${template}`, "1");
      } else {
        await redis.set(`wa:sent:${phone}:${template}`, "1", {
          ex: MARKETING_GAP_SECONDS,
        });
      }
      await redis.set(`wa:sent:${phone}:marketing`, "1", {
        ex: MARKETING_GAP_SECONDS,
      });
    }
  } catch (err) {
    console.error("[wa] order message failed (ignored):", err.message);
  }
}

const createOrder = async (req, res) => {
  const {
    items,
    guestInfo,
    customerInfo,
    deliveryMethod,
    note,
    // What the browser thinks the order costs. Checked against the server's
    // own figure below, never stored as given.
    totalAmount: claimedTotal,
    vendorId,
    deliveryLocation,
    packCount,
    orderId,
    // Optional: set by the mobile app for signed-in customers so their order
    // history (getOrderHistoryByCustomer) can find this order by customerId,
    // not only by phone.
    customerId,
    // Optional: the influencer code the checkout page found in localStorage
    // from a chowspace.ng/i/<code> visit within the last 30 days.
    referralCode,
  } = req.body;

  if (
    !items ||
    (!guestInfo && !customerInfo) ||
    !deliveryMethod ||
    !vendorId ||
    !orderId
  ) {
    return res.status(400).json({ message: "Missing required order fields." });
  }

  try {
    const closed = await rejectIfClosed(vendorId, res);
    if (closed) return closed;

    // Every amount is recomputed from the database. Before this, totalAmount,
    // deliveryFee and packFees were stored exactly as posted, so a crafted
    // request could buy a ₦20,000 cart for ₦100.
    const { ok, error, priced } = await priceOrder({
      vendorId,
      items,
      deliveryLocation,
      packCount,
    });

    if (!ok) return res.status(400).json({ message: error });

    // If our price is higher than the one the customer agreed to, something
    // changed while they were checking out. Charging the difference without
    // asking would be wrong, so the order is refused and they re-confirm.
    // A lower price is fine — we simply charge less than they expected.
    if (typeof claimedTotal === "number" && priced.total > claimedTotal) {
      return res.status(409).json({
        message:
          "Prices changed while you were ordering. Please review your cart.",
        total: priced.total,
      });
    }

    const confirmationToken = crypto.randomBytes(16).toString("hex");

    // Best-effort influencer attribution. An unknown/invalid/missing code
    // must never block an order, so failures here just mean no attribution.
    let referral;
    if (referralCode) {
      try {
        const influencer = await Influencer.findOne({
          code: String(referralCode).trim(),
          active: true,
        }).select("_id code");
        if (influencer) {
          referral = { code: influencer.code, influencerId: influencer._id };
        }
      } catch (err) {
        console.error("referral lookup failed (ignored):", err.message);
      }
    }

    const newOrder = await Order.create({
      orderId,
      vendorId,
      customerId: customerId || null,
      ...(referral ? { referral } : {}),
      // Names and prices from the server, so the receipt matches what was
      // actually charged.
      items: priced.lines,
      guestInfo: guestInfo || null,
      customerInfo: customerInfo || null,
      deliveryMethod,
      deliveryLocation: deliveryLocation || null,
      note: note || "",
      itemsTotal: priced.itemsTotal,
      packFees: priced.packFees,
      deliveryFee: priced.deliveryFee,
      serviceFee: priced.serviceFee,
      totalAmount: priced.total,
      vendorShare: priced.vendorShare,
      paymentMethod: "direct",
      paymentStatus: "pending",
      confirmationToken,
    });

    res.status(201).json(newOrder);

    // After the response: a courtesy WhatsApp message. Never awaited into the
    // request path, never able to fail the order.
    maybeSendOrderWhatsapp(newOrder, vendorId);
  } catch (err) {
    console.error("Order creation failed:", err);
    res.status(500).json({ message: "Failed to create order." });
  }
};

const priceConfirmation = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId }).select(
      "totalAmount vendorId guestInfo items",
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Order fetched successfully",
      order,
      totalAmount: order.totalAmount,
    });
  } catch (error) {
    console.error("Price confirmation error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getAllOrders = async (req, res) => {
  // Scoped to the token, never the query string. `?vendorId=` used to be the
  // only filter, and omitting it returned every order the platform has ever
  // taken — names, phones and delivery addresses included.
  //
  // Pagination is opt-in: several dashboards (Analytics.jsx, Wallet.jsx)
  // compute their own totals over the full result set client-side, so
  // defaulting to a capped page would silently truncate those numbers.
  // Passing ?page=&limit= gets a bounded, paginated response; omitting them
  // keeps today's unbounded behavior exactly as-is.
  try {
    const { page, limit } = req.query;
    const paginate = page != null || limit != null;
    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Number(limit) || 100, 500);

    let query = Order.find({ vendorId: req.vendorId })
      .sort({ createdAt: -1 })
      .populate("customerId", "fullname email");

    if (paginate) query = query.skip((pageNum - 1) * limitNum).limit(limitNum);

    const [orders, total] = await Promise.all([
      query,
      paginate ? Order.countDocuments({ vendorId: req.vendorId }) : null,
    ]);

    res.status(200).json({
      success: true,
      orders,
      message: "Orders fetched successfully",
      ...(paginate ? { page: pageNum, limit: limitNum, total } : {}),
    });
  } catch (err) {
    console.error("Fetching orders failed:", err.message);
    res.status(500).json({ message: "Failed to fetch orders." });
  }
};

const getOrderById = async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found." });

    // Belonging to a store is what earns you the customer's address, not
    // knowing the id.
    if (String(order.vendorId) !== String(req.vendorId)) {
      return res.status(403).json({ message: "That order isn't yours." });
    }

    res.json(order);
  } catch (err) {
    console.error("Fetching order failed:", err.message);
    res.status(500).json({ message: "Failed to fetch order." });
  }
};

const updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status, paymentStatus } = req.body;

  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found." });

    if (String(order.vendorId) !== String(req.vendorId)) {
      return res.status(403).json({ message: "That order isn't yours." });
    }

    if (status) order.status = status;

    // paymentStatus is deliberately not settable here. This route was open,
    // so anyone could mark any order paid; even guarded, "paid" should only
    // ever be written by the payment provider's webhook or verify call.
    if (paymentStatus) {
      return res.status(400).json({
        message:
          "Payment status is set by the payment provider, not by this route.",
      });
    }

    await order.save();
    res.json(order);
  } catch (err) {
    console.error("Updating order failed:", err.message);
    res.status(500).json({ message: "Failed to update order." });
  }
};

const getManagerOrders = async (req, res) => {
  try {
    const user = req.user;

    if (!user || user.role !== "manager") {
      return res
        .status(403)
        .json({ message: "Access denied. Only managers allowed." });
    }

    const vendorId = user.vendorId;
    if (!vendorId) {
      return res
        .status(400)
        .json({ message: "No vendor ID associated with manager." });
    }

    // Opt-in pagination, same reasoning as getAllOrders above.
    const { page, limit } = req.query;
    const paginate = page != null || limit != null;
    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Number(limit) || 100, 500);

    let query = Order.find({ vendorId })
      .sort({ createdAt: -1 })
      .populate("customerId", "fullname email");

    if (paginate) query = query.skip((pageNum - 1) * limitNum).limit(limitNum);

    const [orders, total] = await Promise.all([
      query,
      paginate ? Order.countDocuments({ vendorId }) : null,
    ]);

    return res.status(200).json({
      success: true,
      orders,
      ...(paginate ? { page: pageNum, limit: limitNum, total } : {}),
    });
  } catch (err) {
    console.error("Error fetching manager orders:", err);
    return res
      .status(500)
      .json({ message: "Failed to fetch orders for manager." });
  }
};

const cleanupPendingOrders = async (req, res) => {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const result = await Order.deleteMany({
      paymentStatus: "pending",
      createdAt: { $lt: tenMinutesAgo },
    });

    res.status(200).json({
      success: true,
      deletedCount: result.deletedCount,
      message: "Old pending orders cleaned up.",
    });
  } catch (err) {
    console.error("Cleanup failed:", err);
    res.status(500).json({
      success: false,
      message: "Failed to cleanup pending orders.",
    });
  }
};

const getAllOrdersForAdmin = async (req, res) => {
  // Every order the platform has ever taken, no filter at all — the worst
  // case of the three. Same opt-in pagination as getAllOrders/
  // getManagerOrders: admin analytics pages that total the full result set
  // client-side keep working unpaginated exactly as before; a caller that
  // wants a bounded page passes ?page=&limit=.
  try {
    const { page, limit } = req.query;
    const paginate = page != null || limit != null;
    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Number(limit) || 100, 500);

    let query = Order.find({})
      .populate("vendorId", "name")
      .populate("customerId", "email")
      .sort({ createdAt: -1 });

    if (paginate) query = query.skip((pageNum - 1) * limitNum).limit(limitNum);

    const [orders, total] = await Promise.all([
      query,
      paginate ? Order.countDocuments({}) : null,
    ]);

    res.status(200).json({
      success: true,
      orders,
      ...(paginate ? { page: pageNum, limit: limitNum, total } : {}),
    });
  } catch (err) {
    console.error("Error fetching orders for admin:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching orders",
    });
  }
};

module.exports = {
  initializeMoneiPayment,
  verifyMoneiPayment,
  moneiWebhook,
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  getManagerOrders,
  cleanupPendingOrders,
  getAllOrdersForAdmin,
  priceConfirmation,
};
