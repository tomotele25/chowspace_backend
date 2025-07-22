const express = require("express");
const router = express.Router();

const {
  createTicket,
  replyToTicket,
  getMessagesForTicket,
  customerReplyToTicket,
  getAllTickets,
} = require("../controller/support-controller");

const customerAuth = require("../middleware/customerSupportAuth");
const adminAuth = require("../middleware/adminAuth");

// Create ticket - customer only
router.post("/support/ticket/create", customerAuth, createTicket);

// Customer reply
router.post(
  "/ticket/:ticketId/reply/customer",
  customerAuth,
  customerReplyToTicket
);

// Admin reply
router.post("/ticket/:ticketsId/reply", adminAuth, replyToTicket);
router.get("/support/tickets", adminAuth, getAllTickets);
// Get messages for ticket - customer only
router.get("/ticket/:ticketId/messages", customerAuth, getMessagesForTicket);
router.get("/admin/ticket/:ticketId/messages", adminAuth, getMessagesForTicket);

module.exports = router;
