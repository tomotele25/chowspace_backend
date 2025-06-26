const Product = require("../models/product");
const Vendor = require("../models/vendor");
const Manager = require("../models/manager");

// Create a product
const createProduct = async (req, res) => {
  const { productName, price, category, image, available } = req.body;

  if (
    !productName ||
    !price ||
    !category ||
    !image ||
    available === undefined
  ) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required" });
  }

  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    let vendor;

    if (user.role === "vendor") {
      vendor = await Vendor.findOne({ user: user._id });
    } else if (user.role === "manager") {
      const manager = await Manager.findOne({ user: user._id });
      if (!manager) {
        return res
          .status(404)
          .json({ success: false, message: "Manager profile not found" });
      }
      vendor = await Vendor.findById(manager.vendor);
    }

    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor profile not found" });
    }

    const newProduct = new Product({
      productName,
      price,
      category,
      image,
      available,
      vendor: vendor._id,
      createdBy: user._id,
    });

    await newProduct.save();

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: newProduct,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating product",
    });
  }
};

// Get products for the logged-in vendor/manager
const getVendorProducts = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let vendor;

    if (user.role === "vendor") {
      vendor = await Vendor.findOne({ user: user._id });
    } else if (user.role === "manager") {
      const manager = await Manager.findOne({ user: user._id });
      if (!manager) {
        return res.status(404).json({ message: "Manager profile not found" });
      }
      vendor = await Vendor.findById(manager.vendor);
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    const products = await Product.find({ vendor: vendor._id });

    res.status(200).json({ success: true, products });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Toggle product availability
const updateAvailability = async (req, res) => {
  const { id } = req.params;

  try {
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    product.available = !product.available;
    await product.save();

    res.status(200).json({ success: true, product });
  } catch (err) {
    console.error("Error updating product:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get products by vendor ID
const getProductsByVendor = async (req, res) => {
  const vendorId = req.params.id;

  try {
    const products = await Product.find({ vendor: vendorId });

    if (!products || products.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No products found for this vendor" });
    }

    res.status(200).json({ success: true, products });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ New: Get products by vendor slug
const getProductsByVendorSlug = async (req, res) => {
  const { slug } = req.params;

  try {
    const vendor = await Vendor.findOne({ slug });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const products = await Product.find({ vendor: vendor._id });

    if (!products || products.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No products found for this vendor",
      });
    }

    res.status(200).json({
      success: true,
      vendor,
      products,
    });
  } catch (err) {
    console.error("Error fetching products by vendor slug:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = {
  createProduct,
  getVendorProducts,
  updateAvailability,
  getProductsByVendor,
  getProductsByVendorSlug,
};
