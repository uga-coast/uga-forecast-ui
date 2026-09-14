export const OBSERVATION_PROVIDERS = {
  NOAA: "NOAA",
  SSLS: "SSLS",
  USGS: "USGS"
};

// Thresholds are intentionally provider-specific. They reflect the normal
// reporting cadence, not an API-reported equipment status.
export const OBSERVATION_FRESHNESS_THRESHOLDS = {
  [OBSERVATION_PROVIDERS.NOAA]: {
    currentMinutes: 30,
    delayedMinutes: 120,
    staleMinutes: 24 * 60
  },
  [OBSERVATION_PROVIDERS.SSLS]: {
    currentMinutes: 20,
    delayedMinutes: 120,
    staleMinutes: 24 * 60
  },
  [OBSERVATION_PROVIDERS.USGS]: {
    currentMinutes: 30,
    delayedMinutes: 120,
    staleMinutes: 24 * 60
  }
};

export const OBSERVATION_STATUS_LABELS = {
  online: "Online / current",
  delayed: "Delayed",
  stale: "Stale",
  offline: "Offline",
  unknown: "Unknown"
};
