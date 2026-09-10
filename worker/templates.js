/**
 * Single source of truth for WhatsApp copy is queues/templates.js — the API
 * validates the template key against the same map before it enqueues. The
 * worker only renders, so it just re-exports.
 */
const {
  WHATSAPP_TEMPLATES,
  isKnownWhatsappTemplate,
  renderWhatsapp,
} = require("../queues/templates");

module.exports = { WHATSAPP_TEMPLATES, isKnownWhatsappTemplate, renderWhatsapp };
