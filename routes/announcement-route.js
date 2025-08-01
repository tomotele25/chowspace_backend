const express = require("express");
const {
  createAnnouncement,
  getAnnouncement,
  markAnnouncementAsRead,
} = require("../controller/announcement-controller");
const router = express.Router();
const authenticateUser = require("../middleware/authenticateUser");

router.post("/createAnnouncement", createAnnouncement);
router.get("/announcement/:role", authenticateUser, getAnnouncement);
router.patch("/announcement/:id/read", markAnnouncementAsRead);
module.exports = router;
