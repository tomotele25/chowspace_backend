const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { cloudinary } = require("../utils/cloudinary");

/**
 * Storage for vendor verification documents — CAC, ID, proof of address.
 *
 * Deliberately NOT the shared `storage` from utils/cloudinary.js, which drops
 * everything into one public `chowspace_products` folder with a 500x500 crop.
 * These are private business records:
 *
 *   - `type: "authenticated"` means the delivery URL is signed, so the file
 *     isn't readable by anyone who guesses the path
 *   - no transformation, because a resized CAC certificate is unreadable
 *   - pdf allowed alongside images, since that's how most documents arrive
 */
const documentStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "chowspace_verification",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "pdf"],
    type: "authenticated",
    resource_type: "auto",
  },
});

const documentUpload = multer({
  storage: documentStorage,
  limits: {
    fileSize: 8 * 1024 * 1024, // scans and phone photos of documents run large
    files: 3,
  },
});

/** Multer errors as JSON — this app has no global error handler. */
const documentUploadError = (err, res) => {
  const messages = {
    LIMIT_FILE_SIZE: "Each document must be 8MB or smaller",
    LIMIT_FILE_COUNT: "Upload at most 3 documents at a time",
    LIMIT_UNEXPECTED_FILE: `Unexpected field "${err.field}". Use cac, identification or proof_of_address.`,
  };

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: messages[err.code] || `Upload failed: ${err.code}`,
    });
  }

  console.error("Document upload error:", err);
  return res
    .status(500)
    .json({ success: false, message: "Upload failed. Please try again." });
};

/** `.any()` so each file can be named after the document kind it represents. */
const uploadDocuments = (req, res, next) =>
  documentUpload.any()(req, res, (err) =>
    err ? documentUploadError(err, res) : next(),
  );

module.exports = { uploadDocuments };
