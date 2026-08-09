const HARD_CLOSE_HOUR = 22; // 10 PM — platform-wide, no store shows "opened" past this
const HARD_REOPEN_HOUR = 6; // 6 AM — earliest a store can show "opened" again

const DEFAULT_TIMEZONE = "Africa/Lagos";

// Order matches the Vendor.openingHours enum and the Settings UI. Only
// relative offsets are used for date maths, so which day sits at index 0
// doesn't matter — but keeping it Monday-first means defaultOpeningHours()
// reads the way a vendor expects.
const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// Platform default, applied to any vendor who hasn't set their own hours.
// Must stay zero-padded: isVendorOpenNow compares "HH:mm" strings
// lexicographically, and "14:32" >= "9:00" is false.
const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "21:00";

/** A full week of the platform default, 9am–9pm every day. */
const defaultOpeningHours = () =>
  WEEKDAYS.map((day) => ({
    day,
    open: DEFAULT_OPEN,
    close: DEFAULT_CLOSE,
    closed: false,
  }));

/**
 * The hours actually in force for a vendor.
 *
 * An empty `openingHours` keeps meaning "not configured" in the database —
 * the default is substituted here rather than written to the document, so
 * "using the platform default" stays distinguishable from "deliberately chose
 * 9–9", and changing the default later applies to everyone at once.
 */
const effectiveOpeningHours = (vendor) =>
  Array.isArray(vendor?.openingHours) && vendor.openingHours.length
    ? vendor.openingHours
    : defaultOpeningHours();

/** Vendor-local weekday name, e.g. "Monday". */
const localWeekday = (timezone, at) =>
  new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" }).format(at);

/** Vendor-local wall clock as "HH:mm", 24-hour, zero-padded. */
const localTime = (timezone, at) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);

/** "HH:mm" -> minutes since midnight. */
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};

/**
 * Given a vendor's weekly opening hours, determine if they're open right now
 * based purely on what they've configured.
 *
 * openingHours shape (one entry per day):
 *   { day: "Monday", open: "09:00", close: "21:00", closed: false }
 *
 * Note: this assumes hours don't cross midnight (e.g. open 09:00 close 21:00,
 * not open 21:00 close 02:00). updateStoreHours rejects overnight spans, so
 * nothing stored can hit that case — but if overnight hours are ever allowed,
 * this needs a day-rollover check.
 */
const isVendorOpenNow = (openingHours, timezone = DEFAULT_TIMEZONE, at = new Date()) => {
  if (!Array.isArray(openingHours) || openingHours.length === 0) return false;

  const weekday = localWeekday(timezone, at);
  const currentTime = localTime(timezone, at);

  const todayHours = openingHours.find((d) => d.day === weekday);
  if (!todayHours || todayHours.closed) return false;
  if (!todayHours.open || !todayHours.close) return false;

  // "HH:mm" strings compare correctly with plain string comparison.
  // Open is inclusive, close is exclusive — at exactly 21:00 the store is closed.
  return currentTime >= todayHours.open && currentTime < todayHours.close;
};

/**
 * Platform-wide safety net — true between 10 PM and 6 AM (local to the
 * vendor's timezone). Applied on top of manual status, auto-hours and
 * overrides, so nobody shows as "opened" overnight.
 */
const isWithinHardCloseWindow = (timezone = DEFAULT_TIMEZONE, at = new Date()) => {
  const hour = parseInt(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(at),
    10,
  );
  return hour >= HARD_CLOSE_HOUR || hour < HARD_REOPEN_HOUR;
};

/**
 * The next moment the schedule changes state — the soonest upcoming `open` or
 * `close` time across the coming week, skipping days marked closed.
 *
 * Used to expire a manual override: a vendor who closes early at 18:00 stays
 * closed until the schedule next moves (21:00, by which point it agrees), and
 * one who opens early at 07:00 holds until the 09:00 open takes over. Either
 * way a single manual tap never silently disables their schedule.
 *
 * Returns null if every day is marked closed.
 *
 * Timezone note: this advances real time by the computed offset, which assumes
 * vendor-local time and UTC advance in step. True for Africa/Lagos (UTC+1, no
 * DST). A DST timezone would drift by an hour across a transition.
 */
const nextScheduleBoundary = (vendor, from = new Date()) => {
  const timezone = vendor?.timezone || DEFAULT_TIMEZONE;
  const hours = effectiveOpeningHours(vendor);

  const todayIndex = WEEKDAYS.indexOf(localWeekday(timezone, from));
  const nowMinutes = toMinutes(localTime(timezone, from));

  for (let offset = 0; offset <= 7; offset += 1) {
    const day = WEEKDAYS[(todayIndex + offset) % 7];
    const entry = hours.find((d) => d.day === day);
    if (!entry || entry.closed || !entry.open || !entry.close) continue;

    for (const boundary of [entry.open, entry.close]) {
      const delta = offset * 1440 + toMinutes(boundary) - nowMinutes;
      if (delta > 0) return new Date(from.getTime() + delta * 60000);
    }
  }

  return null;
};

/** The vendor's manual override, if one is set and still in force. */
const activeOverride = (vendor, at = new Date()) => {
  const override = vendor?.statusOverride;
  if (!override || !override.status || !override.expiresAt) return null;
  return new Date(override.expiresAt) > at ? override.status : null;
};

/**
 * Single source of truth for "is this vendor open right now" — used by the
 * live-status endpoint, the cron sync, the customer-facing vendor reads and
 * the order guard, so they can never disagree.
 *
 * Priority:
 *   1. Hard close window (10 PM–6 AM) always wins — forces "closed"
 *   2. An unexpired manual override from the dashboard toggle
 *   3. If the vendor uses auto-hours, compute from their schedule — falling
 *      back to the platform 9am–9pm default when they haven't set one
 *   4. Otherwise, their manually-set status field
 */
const getEffectiveStatus = (vendor, at = new Date()) => {
  const timezone = vendor.timezone || DEFAULT_TIMEZONE;

  if (isWithinHardCloseWindow(timezone, at)) return "closed";

  const override = activeOverride(vendor, at);
  if (override) return override;

  if (vendor.useAutoHours) {
    return isVendorOpenNow(effectiveOpeningHours(vendor), timezone, at)
      ? "opened"
      : "closed";
  }

  return vendor.status;
};

module.exports = {
  isVendorOpenNow,
  isWithinHardCloseWindow,
  getEffectiveStatus,
  defaultOpeningHours,
  effectiveOpeningHours,
  nextScheduleBoundary,
  activeOverride,
  WEEKDAYS,
  DEFAULT_OPEN,
  DEFAULT_CLOSE,
  DEFAULT_TIMEZONE,
  HARD_CLOSE_HOUR,
  HARD_REOPEN_HOUR,
};
