const express = require("express");
const router = express.Router();

const {
  createTicket,
  replyToTicket,
  getMessagesForTicket,
  customerReplyToTicket,
  getAllTickets,
} = require("../controller/support-controller");

const { requireRole } = require("../middleware/requireRole");

const customerOnly = requireRole("customer");
const adminOnly = requireRole("admin");

// Create ticket - customer only
router.post("/support/ticket/create", customerOnly, createTicket);

// Customer reply
router.post(
  "/ticket/:ticketId/reply/customer",
  customerOnly,
  customerReplyToTicket,
);

// Admin reply
router.post("/ticket/:ticketsId/reply", adminOnly, replyToTicket);
router.get("/support/tickets", adminOnly, getAllTickets);

// Customer thread. The controller checks the ticket belongs to the caller —
// without that, any customer could read any other customer's support
// conversation by changing the id.
router.get("/ticket/:ticketId/messages", customerOnly, getMessagesForTicket);

router.get("/admin/ticket/:ticketId/messages", adminOnly, getMessagesForTicket);

module.exports = router;
