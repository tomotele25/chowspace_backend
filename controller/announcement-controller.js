const announcement = require("../models/announcement");
const Announcement = require("../models/announcement");

const createAnnouncement = async (req, res) => {
  try {
    const { header, message, audience } = req.body;

    if (!message || !header || !audience) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    const newAnnouncement = new Announcement({
      message,
      header,
      audience,
    });

    await newAnnouncement.save();

    res.status(200).json({
      success: true,
      message: "Announcement created successfully",
      newAnnouncement,
    });
  } catch (error) {
    console.log("Unable to create announcement", error.message);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

const getAnnouncement = async (req, res) => {
  try {
    const { role } = req.params;
    const userId = req.user?.id;
    const announcements = await Announcement.find({
      audience: new RegExp(`^${role}$`, "i"),
    }).select("header message audience createdAt readBy");

    const formattedAnnouncements = announcements.map((a) => {
      const readByList = Array.isArray(a.readBy) ? a.readBy : [];

      return {
        ...a._doc,
        createdAt: new Date(a.createdAt).toLocaleString("en-NG", {
          dateStyle: "medium",
          timeStyle: "short",
        }),
        isRead: readByList.map((r) => r.toString()).includes(userId),
      };
    });

    return res.status(200).json({
      success: true,
      message: "Announcement fetched successfully",
      announcements: formattedAnnouncements,
    });
  } catch (error) {
    console.error("Announcement fetch error:", error);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

const markAnnouncementAsRead = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const announcement = await Announcement.findById(id);
  if (!announcement) return res.status(404).json({ message: "Not found" });

  if (!announcement.readBy.includes(userId)) {
    announcement.readBy.push(userId);
    await announcement.save();
  }

  res.json({ message: "Marked as read" });
};

module.exports = {
  getAnnouncement,
  createAnnouncement,
  markAnnouncementAsRead,
};
