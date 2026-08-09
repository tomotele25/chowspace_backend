const express = require("express");
const router = express.Router();
const { requireRole } = require("../middleware/requireRole");
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

// Managers run the menu day to day, so they share the vendor's product routes.
const storeStaff = requireRole("vendor", "manager");

router.post(
  "/product/createProduct",
  storeStaff,
  upload.single("image"),
  createProduct,
);

router.get("/product/my-products", storeStaff, getVendorProducts);

// Public storefront reads.
router.get("/product/vendor/:id", getProductsByVendor);
router.get("/product/vendor/slug/:slug", getProductsByVendorSlug);

router.patch(
  "/product/:id/toggle-availability",
  storeStaff,
  updateAvailability,
);
router.patch(
  "/product/update/:id",
  storeStaff,
  upload.single("image"),
  updateProduct,
);

// Was open to anonymous callers while every sibling route was guarded — any
// object id deleted any vendor's product.
router.delete("/product-delete/:id", storeStaff, deleteProductById);

router.patch("/product/rearrange", storeStaff, reorderProducts);

module.exports = router;
