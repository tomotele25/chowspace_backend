const express = require("express");
const router = express.Router();
const {
  getOrderHistoryByCustomer,
  getOrderHistoryByPhone,
  getAllCustomersWithUserDetails,
  saveBirthday,
  getAllCustomers,
  getWrapped,
} = require("../controller/customer-controller");
const { requireRole } = require("../middleware/requireRole");

// Every route here was open. `/customerDetails` returned every customer's
// name, phone and birthday to anyone who asked, and `/orderHistory/:customerId`
// returned any customer's full order history including delivery addresses.

// Public order lookup by phone number — for customers who ordered without an
// account (or whose orders carry no customerId). Registered before the
// `:customerId` route so "lookup" isn't captured as an id.
router.get("/orderHistory/lookup", getOrderHistoryByPhone);

// The controller compares the id against the caller, so a customer can only
// read their own history.
router.get(
  "/orderHistory/:customerId",
  requireRole("customer"),
  getOrderHistoryByCustomer,
);

// A GET that writes — it creates Customer documents as a side effect. Admin
// only until it becomes a POST, which is a separate change.
router.get("/customers", requireRole("admin"), getAllCustomersWithUserDetails);

// Deliberately open. The birthday prompt sits inside guest checkout and is
// sent without a token, so requiring a role here would break the main
// ordering flow to protect very little — the worst an anonymous caller
// achieves is writing a birthday against a phone number they already know.
router.post("/customers/birthday", saveBirthday);

router.post("/customerDetails", requireRole("admin"), getAllCustomers);

// "Year in food" summary for the signed-in customer. Own data only — the
// controller reads req.user._id, never a param.
router.get("/customer/wrapped", requireRole("customer"), getWrapped);

module.exports = router;
