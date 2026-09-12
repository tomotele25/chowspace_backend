const express = require("express");
const {
  createRider,
  getRiders,
  getRiderById,
  updateRider,
  deleteRider,
  assignOrderToRider,
} = require("../controller/rider-controller");
const {
  getQueueStats,
  getWhatsappStatus,
} = require("../controller/queue-controller");
const {
  createInfluencer,
  listInfluencers,
} = require("../controller/influencer-controller");
const { requireRole } = require("../middleware/requireRole");

const router = express.Router();

// Every rider route was open to anonymous callers. `getRiders` returned every
// rider's name and phone number, `updateRider` did `$set: req.body` unfiltered,
// and `assignOrderToRider` mutated orders — all without a token.
const adminOnly = requireRole("admin");

router.post("/rider/create-rider", adminOnly, createRider);

router.get("/rider/get-riders", adminOnly, getRiders);

router.get("/rider/get-rider/:id", adminOnly, getRiderById);

router.put("/rider/update/:id", adminOnly, updateRider);

router.delete("/rider/delete/:id", adminOnly, deleteRider);

router.post("/rider/assign-order", adminOnly, assignOrderToRider);

// Queue depth and recent failures. Admin-only because the failure list carries
// customer email addresses.
router.get("/admin/queues", adminOnly, getQueueStats);

// Baileys worker health: is the business number still linked, quota left today.
router.get("/admin/whatsapp/status", adminOnly, getWhatsappStatus);

// Influencer referral program: create a code/link, see clicks/installs/orders.
router.post("/admin/influencers", adminOnly, createInfluencer);
router.get("/admin/influencers", adminOnly, listInfluencers);

module.exports = router;
