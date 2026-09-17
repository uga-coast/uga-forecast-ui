import {
  OBSERVATION_FRESHNESS_THRESHOLDS,
  OBSERVATION_PROVIDERS
} from "../config/observations.js";

const NOAA_API_URL = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

// api.sealevelsensors.org currently serves a certificate for this Georgia Tech
// host. The host below exposes the same public FROST/SensorThings service with
// a valid certificate and permissive CORS headers.
export const SSLS_API_URL = "https://frost-api.rnoc.gatech.edu/v1.0";
export const USGS_API_URL =
  "https://api.waterdata.usgs.gov/ogcapi/v0/collections";
const SSLS_DOCUMENTED_API_URL = "https://api.sealevelsensors.org/v1.0";
const METERS_TO_FEET = 3.280839895;
const SSLS_PAGE_SIZE = 100;
const SSLS_MAX_PAGES = 20;
const OBSERVATION_CACHE_TTL_MS = 5 * 60 * 1000;
const observationCache = new Map();

export function stationKey(station) {
  return `${station?.provider || "unknown"}:${station?.id || "unknown"}`;
}

export function parseObservationDate(timestamp) {
  if (!timestamp) return null;

  let iso = String(timestamp).trim();
  if (iso.includes(" ") && !iso.includes("T")) iso = iso.replace(" ", "T");

  if (!/[zZ]$|[+-]\d{2}:\d{2}$/.test(iso)) iso = `${iso}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getObservationStatus(latestTimestamp, provider, now = new Date()) {
  const latest = parseObservationDate(latestTimestamp);
  const thresholds = OBSERVATION_FRESHNESS_THRESHOLDS[provider];
  if (!latest || !thresholds) return "unknown";

  const ageMinutes = Math.max(0, (now.getTime() - latest.getTime()) / 60000);
  if (ageMinutes <= thresholds.currentMinutes) return "online";
  if (ageMinutes <= thresholds.delayedMinutes) return "delayed";
  if (ageMinutes <= thresholds.staleMinutes) return "stale";
  return "offline";
}

function normalizedObservation(timestamp, value, provider) {
  const date = parseObservationDate(timestamp);
  if (!date || !Number.isFinite(value)) return null;

  return {
    timestamp,
    date,
    value,
    unit: "ft",
    datum: "NAVD88",
    provider
  };
}

export function normalizeNoaaObservations(payload) {
  return (payload?.data || [])
    .map((row) =>
      normalizedObservation(row.t, Number(row.v), OBSERVATION_PROVIDERS.NOAA)
    )
    .filter(Boolean);
}

export function normalizeSslsObservations(payload, station) {
  const sensorElevation = Number(station?.elevationNavd88Meters);
  if (!Number.isFinite(sensorElevation)) return [];

  return (payload?.value || [])
    .map((row) => {
      const relativeWaterLevelMeters = Number(row.result);
      const navd88Feet =
        (relativeWaterLevelMeters + sensorElevation) * METERS_TO_FEET;
      return normalizedObservation(
        row.phenomenonTime,
        navd88Feet,
        OBSERVATION_PROVIDERS.SSLS
      );
    })
    .filter(Boolean);
}

const USGS_NAVD88_PARAMETER_CODES = new Set(["62620", "63160", "72292"]);

export function normalizeUsgsObservations(payload, station) {
  const stationParameterCode = String(station?.observationParameterCode || "");
  const datumOffset = Number(station?.datumOffsetFeet);
  const usesExplicitNavd88Parameter = USGS_NAVD88_PARAMETER_CODES.has(
    stationParameterCode
  );
  const usesSupportedGageHeight =
    stationParameterCode === "00065" &&
    station?.observationDatum === "NAVD88" &&
    Number.isFinite(datumOffset);

  if (!usesExplicitNavd88Parameter && !usesSupportedGageHeight) return [];

  return (payload?.features || [])
    .map((feature) => {
      const properties = feature?.properties || {};
      const parameterCode = String(properties.parameter_code || "");
      if (parameterCode !== stationParameterCode) return null;
      if (properties.value == null || properties.value === "") return null;
      if (properties.unit_of_measure !== "ft") return null;

      const nativeValue = Number(properties.value);
      if (!Number.isFinite(nativeValue)) return null;

      const navd88Value = usesExplicitNavd88Parameter
        ? nativeValue
        : nativeValue + datumOffset;
      const observation = normalizedObservation(
        properties.time,
        navd88Value,
        OBSERVATION_PROVIDERS.USGS
      );
      if (!observation) return null;

      return {
        ...observation,
        stationId: station.id,
        nativeParameterCode: parameterCode,
        nativeUnit: properties.unit_of_measure
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function formatNoaaApiDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${d} ${h}:${min}`;
}

export function buildObservationWindow(cycleTimestamp, hoursBack = 48, hoursForward = 48) {
  const cycleDate = parseObservationDate(cycleTimestamp);
  if (!cycleDate) return null;

  return {
    begin: new Date(cycleDate.getTime() - hoursBack * 3600000),
    end: new Date(cycleDate.getTime() + hoursForward * 3600000)
  };
}

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Observation request failed (${response.status})`);
  return payload;
}

async function fetchNoaaObservations(station, window, signal) {
  const params = new URLSearchParams({
    product: "water_level",
    station: station.id,
    begin_date: formatNoaaApiDate(window.begin),
    end_date: formatNoaaApiDate(window.end),
    datum: "NAVD",
    units: "english",
    time_zone: "gmt",
    format: "json",
    application: "forecast-ui"
  });
  return normalizeNoaaObservations(await fetchJson(`${NOAA_API_URL}?${params}`, signal));
}

function operationalSslsUrl(url) {
  return url.replace(SSLS_DOCUMENTED_API_URL, SSLS_API_URL);
}

async function fetchSslsObservations(station, window, signal) {
  const filter = [
    `phenomenonTime ge ${window.begin.toISOString()}`,
    `phenomenonTime le ${window.end.toISOString()}`
  ].join(" and ");
  const params = new URLSearchParams({
    "$filter": filter,
    "$orderby": "phenomenonTime asc",
    "$select": "phenomenonTime,result",
    "$top": String(SSLS_PAGE_SIZE)
  });

  const baseUrl = `${SSLS_API_URL}/Datastreams(${station.observationDatastreamId})/Observations`;
  const firstPayload = await fetchJson(`${baseUrl}?${params}`, signal);
  const rows = [...(firstPayload?.value || [])];
  const totalCount = Number(firstPayload?.["@iot.count"]);

  if (Number.isFinite(totalCount) && totalCount > rows.length) {
    const pageCount = Math.min(
      Math.ceil(totalCount / SSLS_PAGE_SIZE),
      SSLS_MAX_PAGES
    );
    const remainingRequests = [];

    for (let page = 1; page < pageCount; page += 1) {
      const pageParams = new URLSearchParams(params);
      pageParams.set("$skip", String(page * SSLS_PAGE_SIZE));
      remainingRequests.push(fetchJson(`${baseUrl}?${pageParams}`, signal));
    }

    const remainingPayloads = await Promise.all(remainingRequests);
    remainingPayloads.forEach((payload) => rows.push(...(payload?.value || [])));
  } else {
    let nextUrl = firstPayload?.["@iot.nextLink"] || null;
    let pageCount = 1;
    while (nextUrl && pageCount < SSLS_MAX_PAGES) {
      const payload = await fetchJson(operationalSslsUrl(nextUrl), signal);
      rows.push(...(payload?.value || []));
      nextUrl = payload?.["@iot.nextLink"] || null;
      pageCount += 1;
    }
  }

  return normalizeSslsObservations({ value: rows }, station).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
}

async function fetchUsgsObservations(station, window, signal) {
  const params = new URLSearchParams({
    f: "json",
    time_series_id: station.observationTimeSeriesId,
    datetime: `${window.begin.toISOString()}/${window.end.toISOString()}`,
    limit: "1000"
  });
  const url = `${USGS_API_URL}/continuous/items?${params}`;
  return normalizeUsgsObservations(await fetchJson(url, signal), station);
}

export async function fetchStationObservations(station, cycleTimestamp, signal) {
  if (!station?.hasObservations) return [];
  const window = buildObservationWindow(cycleTimestamp);
  if (!window) return [];

  const cacheKey = `${stationKey(station)}:${cycleTimestamp}`;
  const cached = observationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.series;

  let series;
  if (station.provider === OBSERVATION_PROVIDERS.NOAA) {
    series = await fetchNoaaObservations(station, window, signal);
  } else if (station.provider === OBSERVATION_PROVIDERS.SSLS) {
    series = await fetchSslsObservations(station, window, signal);
  } else if (station.provider === OBSERVATION_PROVIDERS.USGS) {
    series = await fetchUsgsObservations(station, window, signal);
  } else {
    throw new Error(`Unsupported observation provider: ${station.provider}`);
  }

  observationCache.set(cacheKey, {
    series,
    expiresAt: Date.now() + OBSERVATION_CACHE_TTL_MS
  });
  return series;
}

async function fetchNoaaLatestTimestamp(station, signal) {
  const params = new URLSearchParams({
    product: "water_level",
    date: "latest",
    station: station.id,
    datum: "NAVD",
    units: "english",
    time_zone: "gmt",
    format: "json",
    application: "forecast-ui"
  });
  const series = normalizeNoaaObservations(
    await fetchJson(`${NOAA_API_URL}?${params}`, signal)
  );
  return series.at(-1)?.timestamp || null;
}

async function fetchSslsLatestTimestamps(stations, signal) {
  const params = new URLSearchParams({
    "$filter": "name eq 'Water Level'",
    "$select": "@iot.id,phenomenonTime"
  });
  const payload = await fetchJson(`${SSLS_API_URL}/Datastreams?${params}`, signal);
  const stationByDatastream = new Map(
    stations.map((station) => [String(station.observationDatastreamId), station])
  );
  const result = {};

  for (const stream of payload?.value || []) {
    const station = stationByDatastream.get(String(stream?.["@iot.id"]));
    if (!station) continue;
    result[stationKey(station)] = stream.phenomenonTime?.split("/").at(-1) || null;
  }
  return result;
}

async function fetchUsgsLatestTimestamps(stations, signal) {
  const stationByTimeSeries = new Map(
    stations.map((station) => [station.observationTimeSeriesId, station])
  );
  const seriesList = stations
    .map((station) => `'${station.observationTimeSeriesId.replaceAll("'", "''")}'`)
    .join(",");
  const params = new URLSearchParams({
    f: "json",
    filter: `time_series_id IN (${seriesList})`,
    "filter-lang": "cql2-text",
    limit: String(stations.length)
  });
  const payload = await fetchJson(
    `${USGS_API_URL}/latest-continuous/items?${params}`,
    signal
  );
  const result = {};

  for (const feature of payload?.features || []) {
    const station = stationByTimeSeries.get(feature?.properties?.time_series_id);
    if (!station) continue;
    const observation = normalizeUsgsObservations(
      { features: [feature] },
      station
    ).at(-1);
    if (observation) result[stationKey(station)] = observation.timestamp;
  }

  return result;
}

export async function fetchLatestObservationTimes(stations, signal) {
  const result = {};
  const noaaStations = stations.filter(
    (station) => station.provider === OBSERVATION_PROVIDERS.NOAA && station.hasObservations
  );
  const sslsStations = stations.filter(
    (station) => station.provider === OBSERVATION_PROVIDERS.SSLS && station.hasObservations
  );
  const usgsStations = stations.filter(
    (station) => station.provider === OBSERVATION_PROVIDERS.USGS && station.hasObservations
  );

  const [noaaResults, sslsResult, usgsResult] = await Promise.all([
    Promise.allSettled(
      noaaStations.map((station) => fetchNoaaLatestTimestamp(station, signal))
    ),
    sslsStations.length
      ? fetchSslsLatestTimestamps(sslsStations, signal).catch(() => ({}))
      : Promise.resolve({}),
    usgsStations.length
      ? fetchUsgsLatestTimestamps(usgsStations, signal).catch(() => ({}))
      : Promise.resolve({})
  ]);

  noaaResults.forEach((entry, index) => {
    if (entry.status === "fulfilled") {
      result[stationKey(noaaStations[index])] = entry.value;
    }
  });

  return { ...result, ...sslsResult, ...usgsResult };
}
