const express = require("express");
const {
  createAnnouncement,
  getAnnouncement,
  markAnnouncementAsRead,
} = require("../controller/announcement-controller");
const router = express.Router();
const { requireRole, requireAuth } = require("../middleware/requireRole");

// Was open — anyone could broadcast a message to every vendor or customer.
router.post("/createAnnouncement", requireRole("admin"), createAnnouncement);

// The :role param is now ignored in favour of the caller's own role; it stays
// in the path so existing frontend URLs keep working.
router.get("/announcement/:role", requireAuth, getAnnouncement);

// Had no middleware at all while the controller read `req.user.id`, so every
// call threw a TypeError and 500'd.
router.patch("/announcement/:id/read", requireAuth, markAnnouncementAsRead);

module.exports = router;
