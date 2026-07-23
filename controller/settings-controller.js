const Vendor = require("../models/vendor");
const { getEffectiveStatus } = require("../utils/storeHours");

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/; // "HH:mm", 24-hour


/* ══════════════════════════════════════════
   Store hours
   ══════════════════════════════════════════ */

// PUT /api/vendor/update-hours
// Body: { openingHours: [{ day, open, close, closed }, ...] }
// Vendor identity comes from protectVendor middleware, not the URL —
// matches your existing frontend call. Checks the common attachment
// patterns since I haven't seen protectVendor's implementation.
const updateStoreHours = async (req, res) => {
  try {
    const targetId =
      req.vendorId ||
      req.vendor?._id ||
      req.user?.vendorId ||
      req.body.vendorId ||
      req.params.vendorId;

    if (!targetId) {
      return res.status(401).json({
        success: false,
        message:
          "Could not identify vendor from request. Check how protectVendor attaches vendor identity to req.",
      });
    }

    const { openingHours } = req.body;

    if (!Array.isArray(openingHours) || openingHours.length === 0) {
      return res.status(400).json({
        success: false,
        message: "openingHours must be a non-empty array",
      });
    }

    // Validate every entry before writing anything
    for (const entry of openingHours) {
      if (!WEEKDAYS.includes(entry.day)) {
        return res.status(400).json({
          success: false,
          message: `Invalid day: ${entry.day}`,
        });
      }

      if (entry.closed) continue; // no time validation needed for a closed day

      if (!TIME_RE.test(entry.open) || !TIME_RE.test(entry.close)) {
        return res.status(400).json({
          success: false,
          message: `${entry.day}: open/close must be in HH:mm format`,
        });
      }

      if (entry.close <= entry.open) {
        return res.status(400).json({
          success: false,
          message: `${entry.day}: closing time must be after opening time`,
        });
      }
    }

    const vendor = await Vendor.findById(targetId);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    vendor.openingHours = openingHours;
    await vendor.save({ validateModifiedOnly: true });

    res.status(200).json({
      success: true,
      message: "Store hours updated.",
      data: vendor.openingHours,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* ══════════════════════════════════════════
   Auto hours (open/close automatically)
   ══════════════════════════════════════════ */

// GET /api/vendor/:vendorId/live-status
const getLiveStoreStatus = async (req, res) => {
  try {
    const { vendorId } = req.params;

    const vendor = await Vendor.findById(vendorId).select(
      "status openingHours timezone useAutoHours",
    );

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const status = getEffectiveStatus(vendor);

    res.status(200).json({
      success: true,
      status,
      useAutoHours: Boolean(vendor.useAutoHours),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// PATCH /api/vendor/:vendorId/auto-hours
const setAutoHoursPreference = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { useAutoHours } = req.body;

    if (typeof useAutoHours !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "useAutoHours must be a boolean",
      });
    }

    const vendor = await Vendor.findById(vendorId);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    if (
      useAutoHours &&
      (!vendor.openingHours || vendor.openingHours.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Set your store hours before turning on automatic open/close.",
      });
    }

    vendor.useAutoHours = useAutoHours;
    await vendor.save({ validateModifiedOnly: true });

    res.status(200).json({
      success: true,
      message: "Auto-hours preference updated.",
      data: vendor,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// GET /api/cron/sync-store-status — Vercel Cron only
//
// Covers two groups:
//  1. Vendors on auto-hours — kept in sync with their configured schedule
//  2. ANY vendor currently marked "opened" — re-checked against the hard
//     close window, so a vendor who manually opened and forgot to close
//     gets force-closed by 10 PM instead of staying "open" all night
const syncAllVendorStatuses = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const vendors = await Vendor.find({
      $or: [{ useAutoHours: true }, { status: "opened" }],
    }).select("status openingHours timezone useAutoHours");

    let updated = 0;
    for (const vendor of vendors) {
      const nextStatus = getEffectiveStatus(vendor);
      if (vendor.status !== nextStatus) {
        vendor.status = nextStatus;
        await vendor.save({ validateModifiedOnly: true });
        updated += 1;
      }
    }

    res.status(200).json({
      success: true,
      checked: vendors.length,
      updated,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  updateStoreHours,
  getLiveStoreStatus,
  setAutoHoursPreference,
  syncAllVendorStatuses,
};
