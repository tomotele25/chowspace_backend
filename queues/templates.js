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

/** Renders and sends. Throws on an unknown key so the job fails loudly. */
function deliver({ template, to, data }) {
  if (!isKnownTemplate(template)) {
    throw new Error(`Unknown email template: ${template}`);
  }
  return TEMPLATES[template](to, data || {});
}

module.exports = { TEMPLATES, isKnownTemplate, deliver };
