const SupportTicket = require("../models/supportTicket");
const SupportMessage = require("../models/supportMessage");

// Create a new support ticket
const createTicket = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const email = req.user?.email || req.body.email;
    const { subject, message } = req.body;

    if (!subject || !message || !userId || !email) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    const newTicket = new SupportTicket({
      userId,
      subject,
      status: "open",
    });
    await newTicket.save();

    const firstMessage = new SupportMessage({
      ticketId: newTicket._id,
      senderId: userId,
      senderModel: "User",
      message,
      read: false,
    });
    await firstMessage.save();

    res.status(200).json({
      success: true,
      ticket: newTicket,
      firstMessage,
      message: "Support ticket created successfully",
    });
  } catch (error) {
    console.error("Error creating support ticket:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong creating the ticket",
    });
  }
};

// Admin reply to ticket
const replyToTicket = async (req, res) => {
  try {
    const ticketId = req.params.ticketsId;
    const { message } = req.body;
    const adminId = req.user?._id || req.body.adminId;

    if (!message || !ticketId || !adminId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res
        .status(404)
        .json({ success: false, message: "Support ticket not found" });
    }

    const newMessage = new SupportMessage({
      ticketId,
      senderId: adminId,
      senderModel: "Admin",
      message,
      read: false,
    });
    await newMessage.save();

    res.status(200).json({
      success: true,
      message: "Reply sent successfully",
      supportMessage: newMessage,
    });
  } catch (error) {
    console.error("Error replying to support ticket:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong replying to the ticket",
    });
  }
};

// Customer reply to ticket
const customerReplyToTicket = async (req, res) => {
  try {
    const ticketId = req.params.ticketId;
    const { message } = req.body;
    const userId = req.user?.id;

    if (!message || !ticketId || !userId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res
        .status(404)
        .json({ success: false, message: "Support ticket not found" });
    }

    // Optional: check user owns this ticket
    if (ticket.userId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const newMessage = new SupportMessage({
      ticketId,
      senderId: userId,
      senderModel: "User",
      message,
      read: false,
    });
    await newMessage.save();

    res.status(200).json({
      success: true,
      message: "Reply sent successfully",
      supportMessage: newMessage,
    });
  } catch (error) {
    console.error("Error replying to support ticket:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong replying to the ticket",
    });
  }
};

// Get messages for a ticket
const getMessagesForTicket = async (req, res) => {
  try {
    const ticketId = req.params.ticketId;

    const messages = await SupportMessage.find({ ticketId }).sort({
      createdAt: 1,
    });

    res.status(200).json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error("Error fetching support messages:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong fetching messages",
    });
  }
};
const getAllTickets = async (req, res) => {
  try {
    // Optionally filter tickets by user role, etc.
    const tickets = await SupportTicket.find().sort({ createdAt: -1 }); // newest first
    res.status(200).json({
      success: true,
      tickets,
    });
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong fetching tickets",
    });
  }
};

module.exports = {
  createTicket,
  replyToTicket,
  getMessagesForTicket,
  customerReplyToTicket,
  getAllTickets,
};
