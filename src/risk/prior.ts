import { FEATURE_NAMES } from './features.js';

/**
 * Clinical prior, expressed as logistic weights on the features defined in
 * features.ts. It encodes widely reported seizure precipitants (sleep
 * deprivation, stress, missed antiseizure doses, ...) as an ORDERING of
 * relative importance, not as measured effect sizes. It is a conservative
 * starting point that gets replaced/adjusted by the user's own history.
 *
 * Layout: [bias, ...one weight per FEATURE_NAMES entry].
 * A bias of -2.4 means ~8% baseline score when every feature is at reference.
 */
export const PRIOR_BIAS = -2.4;

export const PRIOR_FEATURE_WEIGHTS: Record<(typeof FEATURE_NAMES)[number], number> = {
  sleep: 1.2,
  stress: 0.9,
  caffeine: 0.35,
  exercise: 0.3,
  missed_meds: 0.9,
  heart_rate: 0.4,
  hrv: 0.3,
  motion: 0.3,
};

export const PRIOR_WEIGHTS: readonly number[] = [PRIOR_BIAS, ...FEATURE_NAMES.map((n) => PRIOR_FEATURE_WEIGHTS[n])];

export const PRIOR_MODEL_VERSION = 'logit-prior-1.0';
