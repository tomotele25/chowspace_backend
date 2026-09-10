/**
 * Nigerian phone normalisation, shared by anything that needs to match a
 * customer across orders and Customer docs.
 *
 * The database holds the same person's number in whatever shape the checkout
 * form was filled in: "0803...", "+234803...", "234803...", "803...". This
 * collapses all of those to one canonical MSISDN so a Redis key or a lookup
 * lands on the same value every time.
 *
 * The 0…/234… variant list mirrors the ad-hoc version that grew inside
 * controller/customer-controller.js (saveBirthday, getWrappedByPhone); those
 * call sites can move onto this over time.
 */

/**
 * -> "234XXXXXXXXXX", or null when there aren't enough digits to be a real
 * mobile number. Callers treat null as "no phone" and skip messaging.
 */
function normalizePhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return null;

  if (d.startsWith("234")) {
    // already E.164 without the +
  } else if (d.startsWith("0")) {
    d = "234" + d.slice(1);
  } else if (d.length === 10) {
    // "8031234567" — the leading 0 was dropped on entry
    d = "234" + d;
  } else {
    return null;
  }

  // 234 + 10 national digits
  if (d.length !== 13) return null;
  return d;
}

/**
 * Every stored shape a normalised number might appear as, for
 * `{ phone: { $in: phoneVariants(x) } }` style queries against legacy data.
 */
function phoneVariants(raw) {
  const canonical = normalizePhone(raw);
  if (!canonical) return [];
  const national = "0" + canonical.slice(3);
  return [canonical, national, canonical.slice(3), "+" + canonical];
}

module.exports = { normalizePhone, phoneVariants };
