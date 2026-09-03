/**
 * The rating customers actually see on a storefront card.
 *
 * Most vendors have no written reviews at all, and checkout runs over
 * WhatsApp so on-platform payment status is almost never "paid" — neither
 * signal alone can rank vendors. What we *do* have is order volume: how many
 * orders a vendor took in the last 30 days, relative to every other vendor.
 *
 * `popPercentile` (0..1) is that peer rank — 1.0 for the busiest vendor on
 * the platform, ~0.5 for a median one, 0 for a vendor with no recent orders.
 *
 *   baseline  = 4.2 .. 4.7, rising with peer rank
 *   blended   = weighted mix of the real review average and the baseline,
 *               where the review average earns weight as more reviews land
 *   effective = blended, but pulled toward 5.0 for the busiest vendors
 *
 * Result is clamped to [RATING_FLOOR, 5.0] and rounded to one decimal, so a
 * vendor doing real trade every day lands near 5 and nobody sits below 4.
 */

const RATING_FLOOR = 4.0;
const REVIEW_CONFIDENCE_K = 5; // reviews needed before the real average carries half the weight

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * @param {object} params
 * @param {Array<{stars:number}>} params.ratings   vendor.ratings subdocs
 * @param {number} params.popPercentile            0..1 peer rank by recent order volume
 * @returns {number} rating between RATING_FLOOR and 5.0, one decimal place
 */
const computeDisplayRating = ({ ratings = [], popPercentile = 0 } = {}) => {
  const reviewCount = ratings.length;
  const reviewAvg =
    reviewCount > 0
      ? ratings.reduce((sum, r) => sum + (r.stars || 0), 0) / reviewCount
      : null;

  const p = clamp(popPercentile, 0, 1);
  const baseline = 4.2 + 0.5 * p; // 4.2 .. 4.7
  const w = reviewCount / (reviewCount + REVIEW_CONFIDENCE_K);
  const blended = w * (reviewAvg ?? baseline) + (1 - w) * baseline;
  const effective = Math.max(blended, 4.2 + 0.8 * p);

  return round1(clamp(effective, RATING_FLOOR, 5.0));
};

/**
 * Peer rank (0..1) for every vendor by recent order count.
 * A vendor's percentile is the fraction of other vendors it took strictly
 * more orders than; vendors tied (including everyone on 0) share the lower
 * end. `counts` is a Map<vendorIdString, number>; `vendorIds` is the full
 * set to rank against.
 *
 * @returns {Map<string, number>}
 */
const orderVolumePercentiles = (counts, vendorIds) => {
  const ids = vendorIds.map(String);
  const n = ids.length;
  const values = ids.map((id) => counts.get(id) || 0);
  const denom = n > 1 ? n - 1 : 1;
  return new Map(
    ids.map((id, i) => {
      const mine = values[i];
      const below = values.filter((v) => v < mine).length;
      return [id, below / denom];
    }),
  );
};

module.exports = {
  computeDisplayRating,
  orderVolumePercentiles,
  RATING_FLOOR,
};
