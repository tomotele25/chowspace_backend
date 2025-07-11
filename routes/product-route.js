const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth");
const upload = require("../middleware/upload");

const {
  createProduct,
  getVendorProducts,
  updateAvailability,
  getProductsByVendor,
  getProductsByVendorSlug,
} = require("../controller/product-controller");

router.post(
  "/product/createProduct",
  protect,
  upload.single("image"),
  createProduct
);

router.get("/product/my-products", protect, getVendorProducts);
router.get("/product/vendor/:id", getProductsByVendor);
router.get("/product/vendor/slug/:slug", getProductsByVendorSlug);
router.patch("/product/:id/toggle-availability", protect, updateAvailability);

module.exports = router;
