const mongoose = require("mongoose");

/**
 * Several fields written by createOrder were missing from this schema, so
 * Mongoose's strict mode dropped them silently: `customerInfo` (a signed-in
 * customer's order therefore stored no name or phone at all), `productId` on
 * each item (nothing to reprice against), `deliveryFee`, `packFees` and
 * `confirmationToken`. They are declared here so the write actually lands.
 */
const orderSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    items: [
      {
        // Required for server-side pricing — without it there is nothing to
        // check the client's figures against.
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        name: String,
        price: Number,
        quantity: Number,
        image: String,
      },
    ],
    guestInfo: {
      name: String,
      phone: String,
      address: String,
      email: String,
    },
    // Signed-in customers. Checkout has always sent this; the schema never
    // accepted it, so those orders were anonymous and never appeared in the
    // customer's own order history.
    customerInfo: {
      name: String,
      phone: String,
      email: String,
      address: String,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    deliveryMethod: String,
    deliveryLocation: String,
    note: String,

    // Money. Every one of these is computed by utils/pricing.js from the
    // database, never taken from the request body.
    totalAmount: { type: Number, min: 0 },
    itemsTotal: { type: Number, min: 0 },
    deliveryFee: { type: Number, min: 0, default: 0 },
    packFees: { type: Number, min: 0, default: 0 },
    serviceFee: { type: Number, min: 0, default: 0 },
    // What the vendor is owed, and what their wallet is credited on payment.
    vendorShare: { type: Number, min: 0 },

    // Free-form strings before this, so nothing could be relied on. The enum
    // includes every value already present in the database — "pending",
    // "assigned" and "completed" — because Mongoose validates on save, and
    // omitting one would make existing orders unsaveable the next time a
    // vendor touched them.
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "preparing",
        "assigned",
        "on_the_way",
        "delivered",
        "completed",
        "cancelled",
      ],
      default: "pending",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },

    paymentMethod: String,
    // The lookup key for both the webhook and the verify call, so it needs an
    // index — and must be unique, since it identifies one payment.
    paymentRef: { type: String, index: true, sparse: true },
    confirmationToken: String,

    // Set inside the transaction that credits the vendor, so a retried webhook
    // cannot pay twice.
    walletCreditedAt: { type: Date, default: null },

    // What the payment provider charged the customer on top of the order, so
    // reconciliation can tell our fee apart from theirs.
    moneiFee: { type: Number, min: 0, default: 0 },

    // Instant payout to the vendor's bank.
    //   held   — credited to their wallet, nothing sent (usually no bank details)
    //   paid   — transferred out
    //   failed — the provider refused; the money is still in their wallet
    payoutStatus: {
      type: String,
      enum: ["none", "held", "paid", "failed"],
      default: "none",
    },
    payoutReference: String,
    payoutAt: Date,
    payoutError: String,

    rider: { type: mongoose.Schema.Types.ObjectId, ref: "Rider" },

    // Indexed but deliberately NOT unique. It should be — it is the reference
    // printed on the customer's receipt — but production currently holds one
    // duplicated orderId and 45 orders with none at all, so a unique index
    // would fail to build and take the deploy with it. Clean those up first,
    // then add `unique: true`.
    orderId: {
      type: String,
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

// Every order list is "this vendor, newest first".
orderSchema.index({ vendorId: 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
