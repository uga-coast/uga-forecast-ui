/**
 * Hurricane manifest compatibility utilities.
 *
 * Supports:
 * - Schema v2: storm -> advisories -> runs
 * - Schema v3: storm -> meteorology -> advisories/cycles -> suites -> runs
 *
 * Suite selection is internal. Meteorology is user-selectable.
 */

const PREFERRED_METEOROLOGY = ["nhc", "hafsa", "hafsb"];

function getStorm(manifest, mesh, stormKey, mode = "hurricane") {
  return manifest?.[mode]?.meshes?.[mesh]?.storms?.[stormKey] || null;
}

function getMesh(manifest, mesh, mode = "hurricane") {
  return manifest?.[mode]?.meshes?.[mesh] || null;
}

function isV3Storm(storm) {
  return Boolean(storm?.meteorology && typeof storm.meteorology === "object");
}

/**
 * Return available meteorological forcing models.
 */
export function getHurricaneMeteorology(
  manifest,
  mesh,
  stormKey,
  mode = "hurricane"
) {
  const storm = getStorm(manifest, mesh, stormKey, mode);
  if (!storm) return [];

  if (isV3Storm(storm)) {
    const available = Object.entries(storm.meteorology)
      .filter(([, data]) =>
        Object.keys(data?.advisories || {}).length > 0 ||
        Object.keys(data?.cycles || {}).length > 0
      )
      .map(([key]) => key);

    return available.sort((a, b) => {
      const ai = PREFERRED_METEOROLOGY.indexOf(a);
      const bi = PREFERRED_METEOROLOGY.indexOf(b);

      const ar = ai < 0 ? Infinity : ai;
      const br = bi < 0 ? Infinity : bi;

      return ar - br || a.localeCompare(b);
    });
  }

  const meteo = getMesh(manifest, mesh, mode)?.meteorology;
  return meteo ? [meteo] : [];
}

/**
 * Prefer NHC when available.
 */
export function getDefaultMeteorology(availableMeteorology) {
  if (!availableMeteorology?.length) return "";
  return availableMeteorology.includes("nhc")
    ? "nhc"
    : availableMeteorology[0];
}

/**
 * Return available advisories or forecast cycles, newest first.
 */
export function getHurricaneForecasts(
  manifest,
  mesh,
  stormKey,
  meteorology,
  mode = "hurricane"
) {
  const storm = getStorm(manifest, mesh, stormKey, mode);
  if (!storm) return [];

  let forecasts;

  if (isV3Storm(storm)) {
    const data = storm.meteorology?.[meteorology];
    forecasts =
      meteorology === "nhc"
        ? data?.advisories
        : data?.cycles;
  } else {
    forecasts = storm.advisories;
  }

  return Object.keys(forecasts || {}).sort((a, b) => {
    const aNum = Number(String(a).replace(/\D/g, ""));
    const bNum = Number(String(b).replace(/\D/g, ""));

    return bNum - aNum || b.localeCompare(a);
  });
}

/**
 * Return suites available for a forecast.
 *
 * Suites remain internal to the application.
 */
export function getHurricaneSuites(
  manifest,
  mesh,
  stormKey,
  meteorology,
  forecastId,
  mode = "hurricane"
) {
  const storm = getStorm(manifest, mesh, stormKey, mode);
  if (!storm || !forecastId) return [];

  if (!isV3Storm(storm)) {
    return [stormKey];
  }

  const data = storm.meteorology?.[meteorology];

  const forecast =
    meteorology === "nhc"
      ? data?.advisories?.[forecastId]
      : data?.cycles?.[forecastId];

  return Object.keys(forecast?.suites || {}).sort();
}

/**
 * Resolve an internal suite.
 *
 * An explicit preferred suite takes precedence.
 * Otherwise, choose a deterministic fallback.
 */
export function resolveHurricaneSuite(
  suites,
  preferredSuite = ""
) {
  if (!suites?.length) return "";

  if (preferredSuite && suites.includes(preferredSuite)) {
    return preferredSuite;
  }

  return [...suites].sort()[0];
}

/**
 * Return available run types.
 */
export function getHurricaneRuns(
  manifest,
  mesh,
  stormKey,
  meteorology,
  forecastId,
  preferredSuite = "",
  mode = "hurricane"
) {
  const storm = getStorm(manifest, mesh, stormKey, mode);
  if (!storm || !forecastId) return [];

  if (!isV3Storm(storm)) {
    return Object.keys(
      storm.advisories?.[forecastId] || {}
    );
  }

  const suites = getHurricaneSuites(
    manifest,
    mesh,
    stormKey,
    meteorology,
    forecastId,
    mode
  );

  const suite = resolveHurricaneSuite(suites, preferredSuite);
  const data = storm.meteorology?.[meteorology];

  const forecast =
    meteorology === "nhc"
      ? data?.advisories?.[forecastId]
      : data?.cycles?.[forecastId];

  return Object.keys(
    forecast?.suites?.[suite]?.runs || {}
  );
}

/**
 * Return metadata for a selected hurricane forecast run.
 */
export function getHurricaneRunMetadata(
  manifest,
  mesh,
  stormKey,
  meteorology,
  forecastId,
  runType,
  preferredSuite = "",
  mode = "hurricane"
) {
  const storm = getStorm(manifest, mesh, stormKey, mode);
  if (!storm || !forecastId || !runType) return null;

  if (!isV3Storm(storm)) {
    return storm.advisories?.[forecastId]?.[runType] || null;
  }

  const suites = getHurricaneSuites(
    manifest,
    mesh,
    stormKey,
    meteorology,
    forecastId,
    mode
  );

  const suite = resolveHurricaneSuite(suites, preferredSuite);
  const data = storm.meteorology?.[meteorology];

  const forecast =
    meteorology === "nhc"
      ? data?.advisories?.[forecastId]
      : data?.cycles?.[forecastId];

  return forecast?.suites?.[suite]?.runs?.[runType] || null;
}

/**
 * Return the exact S3 prefix for schema-v3 forecasts.
 *
 * Schema-v2 forecasts do not contain an explicit prefix.
 * Their URLs must continue using the existing legacy builder.
 */
export function getHurricaneS3Prefix(
  manifest,
  mesh,
  stormKey,
  meteorology,
  forecastId,
  runType,
  preferredSuite = "",
  mode = "hurricane"
) {
  const run = getHurricaneRunMetadata(
    manifest,
    mesh,
    stormKey,
    meteorology,
    forecastId,
    runType,
    preferredSuite,
    mode
  );

  return run?.s3Prefix || null;
}