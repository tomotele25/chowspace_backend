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
  reorderProducts,
  updateProduct,
  deleteProductById,
} = require("../controller/product-controller");

router.post(
  "/product/createProduct",
  protect,
  upload.single("image"),
  createProduct
);

router.get("/product/my-products", protect, getVendorProducts);
router.get("/product/vendor/:id", getProductsByVendor);
router.get("/product/:slug", getProductsByVendorSlug);
router.patch("/product/:id/toggle-availability", protect, updateAvailability);
router.patch(
  "/product/update/:id",
  protect,
  upload.single("image"),
  updateProduct
);
router.delete("/product-delete/:id", deleteProductById);
router.patch("/product/rearrange", protect, reorderProducts);

module.exports = router;
