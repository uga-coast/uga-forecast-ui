import test from "node:test";
import assert from "node:assert/strict";
import {
  OBSERVATION_PROVIDER_ENABLED,
  OBSERVATION_PROVIDERS
} from "../src/config/observations.js";
import {
  SSLS_RELIABLE_STATIONS,
  STATIONS_BY_REGION,
  USGS_GEORGIA_STATIONS
} from "../src/data/stations.js";
import {
  fetchLatestObservationTimes,
  fetchStationObservations,
  getObservationStatus,
  normalizeNoaaObservations,
  normalizeSslsObservations,
  normalizeUsgsObservations
} from "../src/services/observations.js";

test("NOAA observations normalize to the shared feet/NAVD88 shape", () => {
  const [observation] = normalizeNoaaObservations({
    data: [{ t: "2026-09-12 13:54", v: "4.735" }]
  });

  assert.equal(observation.provider, OBSERVATION_PROVIDERS.NOAA);
  assert.equal(observation.value, 4.735);
  assert.equal(observation.unit, "ft");
  assert.equal(observation.datum, "NAVD88");
  assert.equal(observation.date.toISOString(), "2026-09-12T13:54:00.000Z");
});

test("configured NOAA stations use the NOAA water-level request path", async () => {
  const originalFetch = globalThis.fetch;
  const noaaStations = STATIONS_BY_REGION.Georgia.filter(
    (station) => station.provider === OBSERVATION_PROVIDERS.NOAA
  );
  const station = noaaStations[0];
  let requestedUrl;

  try {
    globalThis.fetch = async (url) => {
      requestedUrl = String(url);
      return {
        ok: true,
        json: async () => ({
          data: [{ t: "2026-09-13 00:06", v: "2.375" }]
        })
      };
    };

    const observations = await fetchStationObservations(
      station,
      "2026-09-13 00:00"
    );
    const request = new URL(requestedUrl);

    assert.equal(noaaStations.length, 4);
    assert.equal(request.hostname, "api.tidesandcurrents.noaa.gov");
    assert.equal(request.searchParams.get("product"), "water_level");
    assert.equal(request.searchParams.get("station"), station.id);
    assert.equal(request.searchParams.get("datum"), "NAVD");
    assert.equal(request.searchParams.get("units"), "english");
    assert.equal(observations.length, 1);
    assert.equal(observations[0].value, 2.375);
    assert.equal(observations[0].datum, "NAVD88");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SSLS sensor-relative meters convert to surveyed NAVD88 feet", () => {
  const [observation] = normalizeSslsObservations(
    {
      value: [
        { phenomenonTime: "2021-02-15T05:07:12.362Z", result: -2.859 }
      ]
    },
    { elevationNavd88Meters: 3.606 }
  );

  // Matches the official Fort Pulaski SSLS package record (2.450907 ft).
  assert.ok(Math.abs(observation.value - 2.4509) < 0.001);
  assert.equal(observation.provider, OBSERVATION_PROVIDERS.SSLS);
  assert.equal(observation.datum, "NAVD88");
});

test("SSLS data without a surveyed sensor elevation are not converted", () => {
  const observations = normalizeSslsObservations(
    { value: [{ phenomenonTime: "2026-09-12T13:00:00Z", result: -1 }] },
    {}
  );
  assert.deepEqual(observations, []);
});

test("freshness states use provider thresholds and observation timestamps", () => {
  const now = new Date("2026-09-12T14:00:00Z");

  assert.equal(
    getObservationStatus("2026-09-12T13:45:00Z", OBSERVATION_PROVIDERS.SSLS, now),
    "online"
  );
  assert.equal(
    getObservationStatus("2026-09-12T13:30:00Z", OBSERVATION_PROVIDERS.SSLS, now),
    "delayed"
  );
  assert.equal(
    getObservationStatus("2026-09-12T08:00:00Z", OBSERVATION_PROVIDERS.SSLS, now),
    "stale"
  );
  assert.equal(
    getObservationStatus("2026-09-10T14:00:00Z", OBSERVATION_PROVIDERS.SSLS, now),
    "offline"
  );
  assert.equal(getObservationStatus(null, OBSERVATION_PROVIDERS.SSLS, now), "unknown");
});

test("USGS freshness thresholds reflect its 15-minute reporting cadence", () => {
  const now = new Date("2026-09-13T14:00:00Z");

  assert.equal(
    getObservationStatus("2026-09-13T13:30:00Z", OBSERVATION_PROVIDERS.USGS, now),
    "online"
  );
  assert.equal(
    getObservationStatus("2026-09-13T13:29:00Z", OBSERVATION_PROVIDERS.USGS, now),
    "delayed"
  );
  assert.equal(
    getObservationStatus("2026-09-13T11:59:00Z", OBSERVATION_PROVIDERS.USGS, now),
    "stale"
  );
  assert.equal(
    getObservationStatus("2026-09-12T13:59:00Z", OBSERVATION_PROVIDERS.USGS, now),
    "offline"
  );
  assert.equal(
    getObservationStatus(null, OBSERVATION_PROVIDERS.USGS, now),
    "unknown"
  );
});

test("the catalog retains the full preferred SSLS set independently of availability", () => {
  assert.equal(SSLS_RELIABLE_STATIONS.length, 23);
  assert.equal(
    SSLS_RELIABLE_STATIONS.filter((station) => station.hasObservations).length,
    19
  );
  assert.deepEqual(
    SSLS_RELIABLE_STATIONS.map((station) => station.modelStationId),
    Array.from({ length: 23 }, (_, index) => `SSLS${String(index + 1).padStart(2, "0")}`)
  );
  assert.ok(SSLS_RELIABLE_STATIONS.every((station) => station.hasModelData));
});

test("Georgia Tech SSLS stations remain configured but are hidden in the UI", () => {
  assert.equal(OBSERVATION_PROVIDER_ENABLED[OBSERVATION_PROVIDERS.SSLS], false);
});

test("USGS stations use explicitly configured supported observation series", () => {
  assert.deepEqual(
    USGS_GEORGIA_STATIONS.map((station) => station.id),
    ["02228295", "02226180", "022035975"]
  );

  for (const station of USGS_GEORGIA_STATIONS) {
    assert.equal(station.provider, OBSERVATION_PROVIDERS.USGS);
    assert.equal(station.hasObservations, true);
    assert.equal(station.hasModelData, true);
    assert.equal(station.modelStationId, station.id);
    assert.equal(station.observationStatus, "unknown");
    assert.equal(station.observationDatum, "NAVD88");
    assert.equal(station.observationParameterCode, "00065");
    assert.ok(station.observationTimeSeriesId);
    assert.equal(station.datumOffsetFeet, 0);
  }
});

test("USGS observations normalize gage height with the station datum offset", () => {
  const station = USGS_GEORGIA_STATIONS[0];
  const observations = normalizeUsgsObservations(
    {
      features: [
        {
          properties: {
            time: "2026-09-13T11:00:00+00:00",
            value: "-1.01",
            unit_of_measure: "ft",
            parameter_code: "00065"
          }
        },
        {
          properties: {
            time: "2026-09-13T11:15:00+00:00",
            value: null,
            unit_of_measure: "ft",
            parameter_code: "00065"
          }
        }
      ]
    },
    station
  );

  assert.equal(observations.length, 1);
  assert.equal(observations[0].provider, OBSERVATION_PROVIDERS.USGS);
  assert.equal(observations[0].stationId, station.id);
  assert.equal(observations[0].value, -1.01);
  assert.equal(observations[0].unit, "ft");
  assert.equal(observations[0].datum, "NAVD88");
  assert.equal(observations[0].nativeParameterCode, "00065");
  assert.equal(observations[0].nativeUnit, "ft");
});

test("USGS gage height is rejected without explicit NAVD88 datum metadata", () => {
  const station = {
    ...USGS_GEORGIA_STATIONS[0],
    observationDatum: "unknown",
    datumOffsetFeet: undefined
  };
  const observations = normalizeUsgsObservations(
    {
      features: [
        {
          properties: {
            time: "2026-09-13T11:00:00Z",
            value: "1.2",
            unit_of_measure: "ft",
            parameter_code: "00065"
          }
        }
      ]
    },
    station
  );
  assert.deepEqual(observations, []);
});

test("USGS fetch uses the configured continuous series and handles empty/error responses", async () => {
  const originalFetch = globalThis.fetch;
  const station = USGS_GEORGIA_STATIONS[1];
  let requestedUrl;

  try {
    globalThis.fetch = async (url) => {
      requestedUrl = String(url);
      return {
        ok: true,
        json: async () => ({
          features: [
            {
              properties: {
                time: "2026-09-13T10:45:00+00:00",
                value: "-1.11",
                unit_of_measure: "ft",
                parameter_code: "00065"
              }
            }
          ]
        })
      };
    };

    const observations = await fetchStationObservations(
      station,
      "2026-09-13T00:00:00Z"
    );
    const request = new URL(requestedUrl);
    assert.equal(
      request.pathname,
      "/ogcapi/v0/collections/continuous/items"
    );
    assert.equal(
      request.searchParams.get("time_series_id"),
      station.observationTimeSeriesId
    );
    assert.equal(observations.length, 1);

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ features: [] })
    });
    assert.deepEqual(
      await fetchStationObservations(
        USGS_GEORGIA_STATIONS[2],
        "2026-09-14T00:00:00Z"
      ),
      []
    );

    globalThis.fetch = async () => ({
      ok: false,
      status: 503,
      json: async () => ({})
    });
    await assert.rejects(
      fetchStationObservations(
        USGS_GEORGIA_STATIONS[0],
        "2026-09-15T00:00:00Z"
      ),
      /Observation request failed \(503\)/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("USGS latest timestamps tolerate empty and failed station requests", async () => {
  const originalFetch = globalThis.fetch;
  const [currentStation, invalidStation, missingStation] = USGS_GEORGIA_STATIONS;

  try {
    globalThis.fetch = async (url) => {
      const request = new URL(String(url));
      assert.equal(
        request.pathname,
        "/ogcapi/v0/collections/latest-continuous/items"
      );
      assert.equal(request.searchParams.get("filter-lang"), "cql2-text");
      const filter = request.searchParams.get("filter");
      for (const station of USGS_GEORGIA_STATIONS) {
        assert.match(filter, new RegExp(station.observationTimeSeriesId));
      }

      return {
        ok: true,
        json: async () => ({
          features: [
            {
              properties: {
                time: "2026-09-13T13:45:00+00:00",
                value: "1.25",
                unit_of_measure: "ft",
                parameter_code: "00065",
                time_series_id: currentStation.observationTimeSeriesId
              }
            },
            {
              properties: {
                time: "2026-09-13T13:30:00+00:00",
                value: null,
                unit_of_measure: "ft",
                parameter_code: "00065",
                time_series_id: invalidStation.observationTimeSeriesId
              }
            }
          ]
        })
      };
    };

    const latest = await fetchLatestObservationTimes(USGS_GEORGIA_STATIONS);
    assert.equal(
      latest[`USGS:${currentStation.id}`],
      "2026-09-13T13:45:00+00:00"
    );
    assert.equal(latest[`USGS:${invalidStation.id}`], undefined);
    assert.equal(latest[`USGS:${missingStation.id}`], undefined);

    globalThis.fetch = async () => ({
      ok: false,
      status: 503,
      json: async () => ({})
    });
    assert.deepEqual(
      await fetchLatestObservationTimes(USGS_GEORGIA_STATIONS),
      {}
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
