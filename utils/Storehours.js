const HARD_CLOSE_HOUR = 22; // 10 PM — platform-wide, no store shows "opened" past this
const HARD_REOPEN_HOUR = 6; // 6 AM — earliest a store can show "opened" again

/**
 * Given a vendor's weekly opening hours, determine if they're open right now
 * based purely on what they've configured.
 *
 * openingHours shape (one entry per day):
 *   { day: "Monday", open: "09:00", close: "21:00", closed: false }
 *
 * Note: this assumes hours don't cross midnight (e.g. open 09:00 close 21:00,
 * not open 21:00 close 02:00). If you need overnight hours later, this needs
 * a day-rollover check — flag it if that becomes a real case.
 */
const isVendorOpenNow = (openingHours, timezone = "Africa/Lagos") => {
  if (!Array.isArray(openingHours) || openingHours.length === 0) return false;

  const now = new Date();

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  }).format(now);

  const currentTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now); // e.g. "14:32"

  const todayHours = openingHours.find((d) => d.day === weekday);
  if (!todayHours || todayHours.closed) return false;
  if (!todayHours.open || !todayHours.close) return false;

  // "HH:mm" strings compare correctly with plain string comparison
  return currentTime >= todayHours.open && currentTime < todayHours.close;
};

/**
 * Platform-wide safety net — true between 10 PM and 6 AM (local to the
 * vendor's timezone). Applied on top of both manual status and auto-hours,
 * so a vendor who forgets to close (or never set hours at all) can't show
 * as "opened" to customers overnight.
 */
const isWithinHardCloseWindow = (timezone = "Africa/Lagos") => {
  const hour = parseInt(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
    10,
  );
  return hour >= HARD_CLOSE_HOUR || hour < HARD_REOPEN_HOUR;
};

/**
 * Single source of truth for "is this vendor open right now" — used by both
 * the live-status endpoint and the cron sync, so they can never disagree.
 *
 * Priority:
 *   1. Hard close window (10 PM–6 AM) always wins — forces "closed"
 *   2. If the vendor uses auto-hours, compute from their configured schedule
 *   3. Otherwise, fall back to their manually-set status field
 */
const getEffectiveStatus = (vendor) => {
  const timezone = vendor.timezone || "Africa/Lagos";

  if (isWithinHardCloseWindow(timezone)) return "closed";

  if (vendor.useAutoHours) {
    return isVendorOpenNow(vendor.openingHours, timezone) ? "opened" : "closed";
  }

  return vendor.status;
};

module.exports = {
  isVendorOpenNow,
  isWithinHardCloseWindow,
  getEffectiveStatus,
  HARD_CLOSE_HOUR,
  HARD_REOPEN_HOUR,
};
