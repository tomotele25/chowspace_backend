const Vendor = require("../models/vendor");
const Product = require("../models/product");
const Manager = require("../models/manager");
const {
  verificationChecklist,
  productCountsByVendor,
  isPubliclyVisible,
} = require("../utils/vendorVisibility");
const { sendVerificationDecisionEmail } = require("../mailer");

const REQUIRED_DOCUMENTS = ["cac", "identification", "proof_of_address"];

/**
 * Resolves the Vendor a request acts for — vendors own their profile directly,
 * managers reach it through the Manager link.
 *
 * NOTE: a `utils/resolveVendor.js` doing exactly this exists on the
 * bulk-product-upload branch. When these branches merge, drop this and import
 * that one instead — two copies will drift.
 */
const resolveVendor = async (user) => {
  if (!user) return { error: { status: 401, message: "Unauthorized" } };

  if (user.role === "vendor") {
    const vendor = await Vendor.findOne({ user: user._id });
    return vendor
      ? { vendor }
      : { error: { status: 404, message: "Vendor profile not found" } };
  }

  if (user.role === "manager") {
    const manager = await Manager.findOne({ user: user._id });
    if (!manager) {
      return { error: { status: 404, message: "Manager profile not found" } };
    }
    const vendor = await Vendor.findById(manager.vendor);
    return vendor
      ? { vendor }
      : { error: { status: 404, message: "Vendor profile not found" } };
  }

  return { error: { status: 403, message: "Access denied" } };
};

const DOCUMENT_LABELS = {
  cac: "CAC certificate",
  identification: "Valid identification",
  proof_of_address: "Proof of address",
};

/**
 * GET /api/vendor/verification/status
 *
 * Everything the dashboard needs to tell a vendor where they stand. Uses the
 * same checklist function the visibility rule uses, so the vendor is never
 * told they're live by one screen and "3 products to go" by another.
 */
const getVerificationStatus = async (req, res) => {
  try {
    const { vendor, error } = await resolveVendor(req.user);
    if (error) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }

    const productCount = await Product.countDocuments({ vendor: vendor._id });
    const checklist = verificationChecklist(vendor, productCount);

    const uploaded = new Set(
      (vendor.verificationDocuments || []).map((d) => d.kind),
    );

    res.status(200).json({
      success: true,
      ...checklist,
      verificationStatus: vendor.verificationStatus,
      reviewNote: vendor.reviewNote || null,
      documents: REQUIRED_DOCUMENTS.map((kind) => ({
        kind,
        label: DOCUMENT_LABELS[kind],
        uploaded: uploaded.has(kind),
        url:
          (vendor.verificationDocuments || []).find((d) => d.kind === kind)
            ?.url || null,
      })),
    });
  } catch (err) {
    console.error("getVerificationStatus error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * POST /api/vendor/verification/documents
 * multipart: field name is the document kind (cac | identification | proof_of_address)
 *
 * Re-uploading a kind replaces it. Once all three are present the vendor moves
 * to under_review automatically — there's no separate "submit" step to forget.
 */
const uploadVerificationDocuments = async (req, res) => {
  try {
    const { vendor, error } = await resolveVendor(req.user);
    if (error) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }

    const files = req.files || [];
    const accepted = files.filter((f) => REQUIRED_DOCUMENTS.includes(f.fieldname));

    if (accepted.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Attach at least one of: ${REQUIRED_DOCUMENTS.join(", ")}`,
      });
    }

    if (vendor.verificationStatus === "approved") {
      return res.status(409).json({
        success: false,
        message: "Your business is already verified.",
      });
    }

    const documents = (vendor.verificationDocuments || []).filter(
      (d) => !accepted.some((f) => f.fieldname === d.kind),
    );
    accepted.forEach((f) =>
      documents.push({ kind: f.fieldname, url: f.path, uploadedAt: new Date() }),
    );

    vendor.verificationDocuments = documents;

    const complete = REQUIRED_DOCUMENTS.every((kind) =>
      documents.some((d) => d.kind === kind),
    );
    // A re-upload after rejection puts them back in the queue.
    vendor.verificationStatus = complete ? "under_review" : "awaiting_documents";
    if (complete) vendor.reviewNote = undefined;

    await vendor.save({ validateModifiedOnly: true });

    res.status(200).json({
      success: true,
      message: complete
        ? "Documents submitted. We'll review them shortly."
        : "Uploaded. Add the remaining documents to submit for review.",
      verificationStatus: vendor.verificationStatus,
      uploaded: documents.map((d) => d.kind),
    });
  } catch (err) {
    console.error("uploadVerificationDocuments error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * GET /api/admin/verifications?status=under_review
 * Admin review queue.
 */
const listVerifications = async (req, res) => {
  try {
    const status = req.query.status || "under_review";

    const vendors = await Vendor.find(
      status === "all" ? {} : { verificationStatus: status },
    )
      .select(
        "businessName email contact location address category logo slug verificationStatus verificationDocuments reviewNote reviewedAt createdAt",
      )
      .sort({ createdAt: -1 })
      .lean();

    const counts = await productCountsByVendor(
      Product,
      vendors.map((v) => v._id),
    );

    res.status(200).json({
      success: true,
      vendors: vendors.map((v) => {
        const productCount = counts.get(String(v._id)) || 0;
        return {
          ...v,
          productCount,
          // So the reviewer can see whether approving actually puts them live,
          // or whether they'd still be hidden for a missing logo or products.
          wouldGoLive: isPubliclyVisible(
            { ...v, verificationStatus: "approved" },
            productCount,
          ),
        };
      }),
    });
  } catch (err) {
    console.error("listVerifications error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * PATCH /api/admin/verifications/:vendorId
 * Body: { decision: "approved" | "rejected", reviewNote }
 */
const decideVerification = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { decision, reviewNote } = req.body;

    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: 'decision must be "approved" or "rejected"',
      });
    }

    if (decision === "rejected" && !String(reviewNote || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Give a reason so the vendor knows what to fix",
      });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }

    vendor.verificationStatus = decision;
    vendor.reviewNote = decision === "rejected" ? String(reviewNote).trim() : undefined;
    vendor.reviewedAt = new Date();
    vendor.reviewedBy = req.user?._id;
    await vendor.save({ validateModifiedOnly: true });

    const productCount = await Product.countDocuments({ vendor: vendor._id });

    // Best effort — the decision is already saved, so a mail failure must not
    // fail the request.
    sendVerificationDecisionEmail(vendor.email, {
      businessName: vendor.businessName,
      approved: decision === "approved",
      reviewNote: vendor.reviewNote,
    }).catch((err) =>
      console.error("Verification decision email failed:", err.message),
    );

    res.status(200).json({
      success: true,
      message: `Vendor ${decision}`,
      verificationStatus: vendor.verificationStatus,
      isLive: isPubliclyVisible(vendor, productCount),
      checklist: verificationChecklist(vendor, productCount),
    });
  } catch (err) {
    console.error("decideVerification error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  REQUIRED_DOCUMENTS,
  getVerificationStatus,
  uploadVerificationDocuments,
  listVerifications,
  decideVerification,
};
