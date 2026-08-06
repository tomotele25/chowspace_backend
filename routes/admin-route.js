const express = require("express");
const {
  createRider,
  getRiders,
  getRiderById,
  updateRider,
  deleteRider,
  assignOrderToRider,
} = require("../controller/rider-controller");
const { getQueueStats } = require("../controller/queue-controller");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

router.post("/rider/create-rider", createRider);

router.get("/rider/get-riders", getRiders);

router.get("/rider/get-rider/:id", getRiderById);

router.put("/rider/update/:id", updateRider);

router.delete("/rider/delete/:id", deleteRider);

router.post("/rider/assign-order", assignOrderToRider);

// Queue depth and recent failures. Behind adminAuth because the failure list
// carries customer email addresses.
router.get("/admin/queues", adminAuth, getQueueStats);

module.exports = router;
