const Customer = require("../models/customer");
const User = require("../models/user");
const Order = require("../models/order");
const mongoose = require("mongoose");

const getAllCustomers = async (req, res) => {
  try {
    // Paginated, because this returns every customer's name and phone number.
    // Unbounded, a single request was the whole marketing list — and until
    // recently the route had no authentication at all.
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const [customers, total] = await Promise.all([
      Customer.find(
        {},
        {
          phone: 1,
          birthday: 1,
          fullname: 1,
          hasBirthday: 1,
          _id: 0,
        },
      )
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Customer.countDocuments({}),
    ]);

    // An empty page is a valid answer, not a 400 — that made "no customers"
    // indistinguishable from a broken request.
    res.status(200).json({
      success: true,
      message: "Customers fetched successfully",
      data: customers,
      page,
      limit,
      total,
    });
  } catch (error) {
    console.error("Unable to fetch customers", error.message);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const getAllCustomersWithUserDetails = async (req, res) => {
  try {
    const users = await User.find({ role: "customer" });
    if (!users.length) {
      return res
        .status(404)
        .json({ message: "No users with role 'customer' found." });
    }
    const created = [];
    const skipped = [];
    for (const user of users) {
      const existing = await Customer.findOne({ user: user._id });
      if (!existing) {
        const newCustomer = new Customer({
          user: user._id,
          fullname: user.fullname || user.name || "",
          email: user.email || "",
          phone: user.phone || "",
        });
        await newCustomer.save();
        created.push(user.email);
      } else {
        skipped.push(user.email);
      }
    }
    res.status(200).json({
      message: "Customer sync completed",
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
    });
  } catch (error) {
    console.error("Sync error:", error);
    res.status(500).json({ message: "Error syncing customers", error });
  }
};

const getOrderHistoryByCustomer = async (req, res) => {
  const { customerId } = req.params;
  if (!customerId) {
    return res
      .status(400)
      .json({ success: false, message: "Customer ID required" });
  }
  // The id in the URL proves nothing — before this check, changing it in the
  // address bar returned somebody else's order history, addresses included.
  if (String(customerId) !== String(req.user._id)) {
    return res
      .status(403)
      .json({ success: false, message: "You can only view your own orders" });
  }

  try {
    const orders = await Order.find({ customerId }).sort({ createdAt: -1 });
    // An empty history is not an error. Returning 404 made "no orders yet"
    // and "the request failed" look identical to the page.
    return res.status(200).json({ success: true, orders: orders || [] });
  } catch (error) {
    console.error("getOrderHistoryByCustomer error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Could not load your orders" });
  }
};

const saveBirthday = async (req, res) => {
  try {
    const { phone, month, day, vendorId } = req.body;

    if (!phone || !month || !day) {
      return res.status(400).json({
        success: false,
        message: "phone, month and day are required",
      });
    }

    const dayNum = parseInt(day, 10);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) {
      return res.status(400).json({
        success: false,
        message: "Invalid day",
      });
    }

    let normPhone = String(phone).replace(/\D/g, "");
    const phoneVariants = [normPhone];
    if (normPhone.startsWith("234")) {
      phoneVariants.push("0" + normPhone.slice(3));
    } else if (normPhone.startsWith("0")) {
      phoneVariants.push("234" + normPhone.slice(1));
    }

    await Customer.findOneAndUpdate(
      { phone: { $in: phoneVariants } },
      {
        $set: {
          "birthday.month": month,
          "birthday.day": dayNum,
          hasBirthday: true,
          ...(vendorId ? { birthdayVendorId: vendorId } : {}),
        },
        $setOnInsert: {
          phone: normPhone,
          user: null,
          email: null,
        },
      },
      { upsert: true, new: true },
    );

    return res.status(200).json({
      success: true,
      message: "Birthday saved",
    });
  } catch (error) {
    console.error("saveBirthday error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Could not save that birthday",
    });
  }
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// A light personality label from when the customer tends to order.
const orderPersona = (weekdayCounts, hourCounts) => {
  const weekend = (weekdayCounts[0] || 0) + (weekdayCounts[6] || 0);
  const weekdayTotal = weekdayCounts.reduce((a, b) => a + b, 0);
  const lateNight = hourCounts.slice(21).concat(hourCounts.slice(0, 4)).reduce(
    (a, b) => a + b,
    0,
  );
  const lunch = hourCounts.slice(11, 15).reduce((a, b) => a + b, 0);

  if (weekdayTotal === 0) return "The Newcomer";
  if (lateNight / weekdayTotal > 0.35) return "The Midnight Muncher";
  if (weekend / weekdayTotal > 0.5) return "The Weekend Feaster";
  if (lunch / weekdayTotal > 0.4) return "The Lunch Loyalist";
  return "The Everyday Regular";
};

/**
 * GET /api/customer/wrapped?year=2026
 *
 * A "year in food" summary for the signed-in customer, Spotify-Wrapped style.
 * Counts every order that wasn't cancelled (checkout is over WhatsApp, so
 * payment status is almost never "paid" and can't be the filter).
 */
const getWrapped = async (req, res) => {
  try {
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const start = new Date(year, 0, 1);
    const end = year === now.getFullYear() ? now : new Date(year + 1, 0, 1);

    const orders = await Order.find({
      customerId: req.user._id,
      status: { $ne: "cancelled" },
      createdAt: { $gte: start, $lt: end },
    })
      .sort({ createdAt: 1 })
      .populate("vendorId", "businessName slug logo")
      .lean();

    if (!orders.length) {
      return res.status(200).json({ success: true, hasData: false, year });
    }

    const vendorName = (o) => o.vendorId?.businessName || "a vendor";

    let totalSpent = 0;
    let totalItems = 0;
    const byVendor = new Map(); // id -> { name, slug, logo, orders, spent }
    const byItem = new Map(); // name -> qty
    const byMonth = Array(12).fill(0);
    const byWeekday = Array(7).fill(0);
    const byHour = Array(24).fill(0);
    let biggestOrder = orders[0];

    for (const o of orders) {
      const amt = o.totalAmount || 0;
      totalSpent += amt;
      if (amt > (biggestOrder.totalAmount || 0)) biggestOrder = o;

      const d = new Date(o.createdAt);
      byMonth[d.getMonth()] += 1;
      byWeekday[d.getDay()] += 1;
      byHour[d.getHours()] += 1;

      const vid = String(o.vendorId?._id || o.vendorId || "unknown");
      const v =
        byVendor.get(vid) ||
        {
          name: vendorName(o),
          slug: o.vendorId?.slug || null,
          logo: o.vendorId?.logo || null,
          orders: 0,
          spent: 0,
        };
      v.orders += 1;
      v.spent += amt;
      byVendor.set(vid, v);

      for (const it of o.items || []) {
        const q = it.quantity || 1;
        totalItems += q;
        if (it.name) byItem.set(it.name, (byItem.get(it.name) || 0) + q);
      }
    }

    const vendorsRanked = [...byVendor.values()].sort(
      (a, b) => b.orders - a.orders || b.spent - a.spent,
    );
    const itemsRanked = [...byItem.entries()]
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);
    const busiestMonthIdx = byMonth.indexOf(Math.max(...byMonth));
    const busiestWeekdayIdx = byWeekday.indexOf(Math.max(...byWeekday));
    const firstOrder = orders[0];

    return res.status(200).json({
      success: true,
      hasData: true,
      year,
      totalOrders: orders.length,
      totalSpent,
      totalItems,
      uniqueVendors: byVendor.size,
      topVendor: vendorsRanked[0] || null,
      runnerUpVendors: vendorsRanked.slice(1, 3),
      topItems: itemsRanked.slice(0, 3),
      favoriteDish: itemsRanked[0] || null,
      busiestMonth: {
        name: MONTHS[busiestMonthIdx],
        orders: byMonth[busiestMonthIdx],
      },
      favoriteDay: {
        name: WEEKDAYS[busiestWeekdayIdx],
        orders: byWeekday[busiestWeekdayIdx],
      },
      biggestOrder: {
        amount: biggestOrder.totalAmount || 0,
        date: biggestOrder.createdAt,
        vendorName: vendorName(biggestOrder),
      },
      firstOrder: {
        date: firstOrder.createdAt,
        vendorName: vendorName(firstOrder),
      },
      persona: orderPersona(byWeekday, byHour),
    });
  } catch (error) {
    console.error("getWrapped error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Could not build your Wrapped" });
  }
};

// Public: lets a customer (signed in or not) pull up the orders they placed
// with a given phone number. Orders always carry customerInfo.phone or
// guestInfo.phone even when no account/customerId is attached, so this is the
// reliable path for the mobile app. Phone matching mirrors saveBirthday's
// 0…/234… normalisation.
const getOrderHistoryByPhone = async (req, res) => {
  try {
    const raw = String(req.query.phone || "").replace(/\D/g, "");
    if (raw.length < 7) {
      return res
        .status(400)
        .json({ success: false, message: "A valid phone number is required" });
    }

    const phoneVariants = [raw];
    if (raw.startsWith("234")) {
      phoneVariants.push("0" + raw.slice(3));
    } else if (raw.startsWith("0")) {
      phoneVariants.push("234" + raw.slice(1));
    }

    const orders = await Order.find({
      $or: [
        { "customerInfo.phone": { $in: phoneVariants } },
        { "guestInfo.phone": { $in: phoneVariants } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select(
        "orderId status totalAmount items vendorId createdAt deliveryMethod",
      );

    return res.status(200).json({ success: true, orders: orders || [] });
  } catch (error) {
    console.error("getOrderHistoryByPhone error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Could not look up orders" });
  }
};

module.exports = {
  getOrderHistoryByCustomer,
  getOrderHistoryByPhone,
  getAllCustomers,
  getAllCustomersWithUserDetails,
  saveBirthday,
  getWrapped,
};
