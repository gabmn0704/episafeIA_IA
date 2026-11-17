/**
 * Minimum evidence required before a pattern is reported. These guard
 * against inventing correlations from tiny or noisy samples.
 */
export interface Thresholds {
  /** logged days needed before any statistical pattern is attempted */
  minObservationDays: number;
  /** seizures needed overall */
  minSeizures: number;
  /** exposed days that also had a seizure (cell "a") */
  minExposedOutcomeDays: number;
  /** total days with the exposure */
  minExposedDays: number;
  /** minimum point estimate of lift */
  minLift: number;
  /** the lower bound of the lift CI must exceed this (1 = no effect) */
  minLiftLowerBound: number;
  /** co-occurring seizure days needed to report a pair */
  minPairCount: number;
  /** minimum share of seizures in one time-of-day bucket */
  minTimeShare: number;
  /** minimum lower Wilson bound of the share for time-of-day */
  minTimeShareLower: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  minObservationDays: 14,
  minSeizures: 3,
  minExposedOutcomeDays: 3,
  minExposedDays: 5,
  minLift: 1.5,
  minLiftLowerBound: 1.0,
  minPairCount: 3,
  minTimeShare: 0.5,
  minTimeShareLower: 0.25,
};
