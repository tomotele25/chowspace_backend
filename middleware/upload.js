const multer = require("multer");
const { storage } = require("../utils/cloudinary");

/**
 * Uploads for product images and chat attachments.
 *
 * This was `multer({ storage })` with no limits and no filter, on a route with
 * no authentication — so anyone could push files of any size into the
 * Cloudinary account and get back a URL served under our domain. Cloudinary's
 * own `allowed_formats` only rejects the file *after* the whole body has been
 * received and uploaded, so it stops nothing that matters here.
 *
 * Mirrors middleware/documentUpload.js, which already did this correctly.
 */
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const upload = multer({
  storage,
  limits: {
    // Comfortably above a phone photo, far below anything worth abusing.
    fileSize: 5 * 1024 * 1024,
    files: 2,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) {
      // Rejected before a byte reaches Cloudinary.
      return cb(
        new Error("Only JPG, PNG, WebP and GIF images can be uploaded"),
        false,
      );
    }
    cb(null, true);
  },
});

/**
 * Multer errors as JSON. This app has no global error handler, so without it a
 * rejected upload surfaces as an unhandled error rather than a readable
 * message.
 */
const uploadError = (err, res) => {
  const messages = {
    LIMIT_FILE_SIZE: "Images must be 5MB or smaller",
    LIMIT_FILE_COUNT: "Upload at most 2 files at a time",
    LIMIT_UNEXPECTED_FILE: `Unexpected field "${err.field}"`,
  };
  return res.status(400).json({
    success: false,
    message: messages[err.code] || err.message || "Upload failed",
  });
};

module.exports = upload;
module.exports.uploadError = uploadError;
