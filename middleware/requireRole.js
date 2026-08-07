const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Manager = require("../models/manager");
const Vendor = require("../models/vendor");
const Customer = require("../models/customer");

/**
 * The single authentication guard.
 *
 * It replaces five middlewares that verified a JWT and then let *any*
 * authenticated role through — `auth.js`, `authenticateUser.js`,
 * `bothRole.js`, `customers.js` and `isVendor.js`. Because those never
 * rejected, routes that looked guarded were open to every logged-in user: a
 * manager could rewrite their vendor's payout account, a customer could take
 * a vendor's menu offline. Patching each route would have left the same trap
 * for the next one, so the guard itself is the fix.
 *
 * Usage:
 *   requireRole("admin")
 *   requireRole("vendor")
 *   requireRole("vendor", "manager")
 *   requireRole("customer")
 *
 * Contract:
 *   401  no token, bad token, or the user no longer exists
 *   403  authenticated, but not one of the listed roles
 *
 * On success it attaches:
 *   req.user      the User document, without the password
 *   req.vendorId  for vendor and manager — the Vendor this request acts for,
 *                 resolved from the token and NEVER from a param or body
 *   req.customerId for customer, when a Customer record exists
 *
 * `req.vendorId` is the important one. Several controllers used to fall back
 * to `req.body.vendorId` or `req.params.vendorId` when the token gave them
 * nothing, which let a caller name whichever vendor they liked. Resolving it
 * here, and failing closed when it can't be resolved, removes that option.
 */
function requireRole(...allowedRoles) {
  if (allowedRoles.length === 0) {
    throw new Error("requireRole() needs at least one role");
  }

  return async function guard(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    } catch {
      return res
        .status(401)
        .json({ success: false, message: "Invalid or expired token" });
    }

    try {
      const user = await User.findById(decoded.id).select("-password");
      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      if (!allowedRoles.includes(user.role)) {
        return res
          .status(403)
          .json({ success: false, message: "You don't have access to this" });
      }

      // Resolve the vendor this request acts for. A vendor owns one directly;
      // a manager reaches one through the Manager link. Failing closed here
      // matters: without it the controller sees `undefined` and a query like
      // { vendorId: undefined } matches documents where the field is absent
      // rather than matching nothing.
      if (user.role === "vendor") {
        const vendor = await Vendor.findOne({ user: user._id }).select("_id");
        if (!vendor) {
          return res.status(403).json({
            success: false,
            message: "No vendor profile for this account",
          });
        }
        req.vendorId = vendor._id;
        user.vendorId = vendor._id;
      }

      if (user.role === "manager") {
        const manager = await Manager.findOne({ user: user._id }).select(
          "vendor",
        );
        if (!manager?.vendor) {
          return res.status(403).json({
            success: false,
            message: "This manager isn't linked to a store",
          });
        }
        req.vendorId = manager.vendor;
        user.vendorId = manager.vendor;
      }

      if (user.role === "customer") {
        const customer = await Customer.findOne({ user: user._id }).select(
          "_id",
        );
        // Absent is fine — a customer who has never ordered has no Customer
        // document yet, and the routes that need one check for themselves.
        if (customer) req.customerId = customer._id;
      }

      req.user = user;
      next();
    } catch (error) {
      console.error("requireRole error:", error.message);
      return res
        .status(500)
        .json({ success: false, message: "Could not verify your access" });
    }
  };
}

/**
 * Any signed-in user, whatever their role.
 *
 * Only for routes where every role legitimately belongs — reading your own
 * announcements, for instance. If a route is meant for one role, name it:
 * "any authenticated user" is how the old middlewares ended up permitting
 * everything.
 */
const requireAuth = requireRole(
  "admin",
  "vendor",
  "manager",
  "customer",
  "rider",
);

/**
 * Attaches the user when a valid token is present, and does nothing when it
 * isn't. Never rejects.
 *
 * For routes that legitimately serve both signed-in staff and anonymous
 * customers — chat being the case here, since most customers order as guests
 * and have no account to authenticate with. The route can't demand a token,
 * but it still needs to know whether it has one, because that is what decides
 * whether a message may claim to be from the vendor.
 *
 * Only ever used to grant less, never more: no token means treated as a
 * stranger, which is the safe default.
 */
async function attachUserIfPresent(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return next();

  try {
    const decoded = jwt.verify(
      authHeader.split(" ")[1],
      process.env.JWT_SECRET,
    );
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return next();

    if (user.role === "vendor") {
      const vendor = await Vendor.findOne({ user: user._id }).select("_id");
      if (vendor) req.vendorId = vendor._id;
    } else if (user.role === "manager") {
      const manager = await Manager.findOne({ user: user._id }).select(
        "vendor",
      );
      if (manager?.vendor) req.vendorId = manager.vendor;
    }

    req.user = user;
  } catch {
    // A bad token is treated as no token rather than an error — the caller
    // simply gets the anonymous experience.
  }
  next();
}

module.exports = { requireRole, requireAuth, attachUserIfPresent };
