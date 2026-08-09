const express = require("express");
const router = express.Router();
const {
  getOrderHistoryByCustomer,
  getAllCustomersWithUserDetails,
  saveBirthday,
  getAllCustomers,
} = require("../controller/customer-controller");
const { requireRole } = require("../middleware/requireRole");

// Every route here was open. `/customerDetails` returned every customer's
// name, phone and birthday to anyone who asked, and `/orderHistory/:customerId`
// returned any customer's full order history including delivery addresses.

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

module.exports = router;
