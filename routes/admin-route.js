const express = require("express");
const {
  createRider,
  getRiders,
  getRiderById,
  updateRider,
  deleteRider,
  assignOrderToRider,
} = require("../controller/rider-controller");

const router = express.Router();

router.post("/rider/create-rider", createRider);

router.get("/rider/get-riders", getRiders);

router.get("/rider/get-rider/:id", getRiderById);

router.put("/rider/update/:id", updateRider);

router.delete("/rider/delete/:id", deleteRider);

router.post("/rider/assign-order", assignOrderToRider);

module.exports = router;
