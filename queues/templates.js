const {
  sendSignupEmail,
  sendVendorInviteEmail,
  sendManagerInviteEmail,
  orderConfirmationEmail,
  sendVendorVerificationEmail,
  sendVerificationDecisionEmail,
} = require("../mailer");

/**
 * The templates a queued email may name.
 *
 * Jobs carry a key from this table plus plain data — never rendered HTML.
 * A job can sit in Redis across a deploy, so if the body travelled with it a
 * template fix would reach everything except the mail already waiting to be
 * sent. Resolving the key at delivery time means the worker always renders
 * with the current template.
 *
 * Shared by the producer, which validates the key before enqueueing, and the
 * worker, which resolves it. One table, so a typo can't pass the enqueue and
 * then fail forever in the worker.
 */
const TEMPLATES = {
  "customer-welcome": (to, data) => sendSignupEmail(to, data.fullname),
  "order-confirmation": (to, data) =>
    orderConfirmationEmail(
      to,
      data.subject || "Your Chowspace Order Has Been Confirmed 🎉",
    ),
  "vendor-verification": (to, data) => sendVendorVerificationEmail(to, data),
  "vendor-invite": (to, data) => sendVendorInviteEmail(to, data),
  "manager-invite": (to, data) => sendManagerInviteEmail(to, data),
  "verification-decision": (to, data) =>
    sendVerificationDecisionEmail(to, data),
};

function isKnownTemplate(template) {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, template);
}

/**
 * WhatsApp message bodies.
 *
 * Same key-not-body rule as the email table: the job carries a key plus plain
 * data, and the text is rendered at send time — inside the Baileys worker,
 * which imports this exact map. Kept deliberately personal and
 * non-promotional; these go out from the real business line seconds after an
 * order, so they must read like a shop replying, not like marketing.
 *
 *   data: { name, vendorName, orderId }
 */
const WHATSAPP_TEMPLATES = {
  "wa-first-order": ({ name, vendorName }) =>
    `Hi ${name || "there"},\n\n` +
    `Thank you for your first order with ${
      vendorName || "us"
    } on Chowspace.\n\n` +
    `Please save this number so we can stay in touch. Customers on our list ` +
    `are the first to hear about offers, giveaways and little gifts we send ` +
    `from time to time.\n\n` +
    `Order again anytime at https://chowspace.ng`,
  "wa-returning": ({ name, vendorName }) =>
    `Hi ${name || "there"},\n\n` +
    `Thank you for ordering from ${
      vendorName || "us"
    } again on Chowspace — it's good to have you back.\n\n` +
    `If you haven't already, save this number so you don't miss our offers, ` +
    `giveaways and customer gifts.\n\n` +
    `Order again anytime at https://chowspace.ng`,
};

function isKnownWhatsappTemplate(template) {
  return Object.prototype.hasOwnProperty.call(WHATSAPP_TEMPLATES, template);
}

/** Renders a WhatsApp body. Throws on an unknown key so the job fails loudly. */
function renderWhatsapp({ template, data }) {
  if (!isKnownWhatsappTemplate(template)) {
    throw new Error(`Unknown whatsapp template: ${template}`);
  }
  return WHATSAPP_TEMPLATES[template](data || {});
}

/** Renders and sends. Throws on an unknown key so the job fails loudly. */
function deliver({ template, to, data }) {
  if (!isKnownTemplate(template)) {
    throw new Error(`Unknown email template: ${template}`);
  }
  return TEMPLATES[template](to, data || {});
}

module.exports = {
  TEMPLATES,
  isKnownTemplate,
  deliver,
  WHATSAPP_TEMPLATES,
  isKnownWhatsappTemplate,
  renderWhatsapp,
};
