# Observation providers

## Previous NOAA data flow

- `src/data/stations.js` defined NOAA stations as `{ id, name, lat, lon }`, grouped by forecast region.
- `src/App.jsx` selected the region's station list and built NOAA station-analysis URLs from the selected station ID.
- `src/components/LeafletMap.jsx` rendered every station with one blue marker and a NOAA-specific accessible label. Selecting a marker opened the station panel.
- `src/components/StationPanel.jsx` built the NOAA CO-OPS `water_level` request directly, requesting English units, GMT, and NAVD. Its local normalizer converted NOAA `t`/`v` fields into chart points, which were combined with ADCIRC analysis and forecast series.

The NOAA assumptions were therefore spread across the station catalog, marker text, sidebar label, observation request/state names, value formatting, and the assumption that every non-clicked station had ADCIRC data keyed by its station ID.

## Current internal model

Stations now declare `provider`, `hasObservations`, and `hasModelData`. Provider-specific identifiers and vertical-reference metadata remain on the station record. The UI consumes normalized observations with this shape:

```js
{
  timestamp,
  date,
  value,
  unit: "ft",
  datum: "NAVD88",
  provider: "NOAA" | "SSLS"
}
```

`src/services/observations.js` owns API requests and NOAA/SSLS normalization. `src/config/observations.js` owns provider freshness thresholds. Map location, observation availability/freshness, and ADCIRC availability are intentionally independent.

The SSLS API limits observation pages to 100 records. After the first page supplies the total count, remaining pages are fetched concurrently, combined in timestamp order, and cached for five minutes so reopening a station does not repeat the full request.

## SSLS units and vertical reference

The SensorThings `Water Level` datastream describes its result as water level relative to the fixed sensor position and declares meters. A station `Thing` may provide a surveyed `properties.elevationNAVD88`. For the reliable stations included here, the normalized elevation is:

```text
NAVD88 feet = (SensorThings result meters + sensor elevation NAVD88 meters) × 3.280839895
```

This was checked against the official SSLS Most Reliable data package: Fort Pulaski (A) returned `-2.859 m` at `2021-02-15T05:07:12.362Z`; with its `3.606 m` sensor elevation, the result is `2.4509 ft NAVD88`, matching the packaged value. Stations without a verified elevation are not converted or included in this first live subset.

The documented `api.sealevelsensors.org` hostname currently presents a TLS certificate for `frost-api.rnoc.gatech.edu`. The application uses that certificate-valid Georgia Tech hostname, which exposes the same public FROST data and permits cross-origin browser requests. This should be rechecked periodically.

## SSLS station selection

The map uses the project's 23-station published Most Reliable Sensors subset. Of those locations, 19 have both a current SensorThings `Thing`/`Water Level` datastream and a surveyed NAVD88 sensor elevation, so they load live observations. The other four locations remain on the map as offline stations because they are no longer exposed by the live `Things` collection. Test units, environmental-only devices, unsurveyed sensors, and the unclassified extra record in the current package are excluded.

Station location remains independent from live observation availability in the data model. The map displays current, delayed, stale, and unknown stations, but hides stations classified as offline. A hidden station automatically returns when its latest observation becomes recent enough.

## Freshness

Freshness comes from the latest observation timestamp, not the SSLS `properties.status` field. Current thresholds are:

| Provider | Online/current | Delayed | Stale | Offline |
| --- | --- | --- | --- | --- |
| NOAA | up to 30 min | 30 min–2 hr | 2–24 hr | over 24 hr |
| SSLS | up to 20 min | 20 min–2 hr | 2–24 hr | over 24 hr |
| USGS | up to 30 min | 30 min–2 hr | 2–24 hr | over 24 hr |

Missing/unparseable timestamps and request failures are `unknown`. The viewer refreshes latest timestamps every five minutes. Marker styling and popups communicate delayed, stale, and unknown states; offline stations are omitted from the map.

The Display controls provide a master “Show Observation Stations” switch plus independent NOAA tide-gauge and Georgia Tech SSLS dataset checkboxes. NOAA is enabled by default; SSLS is opt-in for now. Provider choices are retained in shared URLs with the `noaa` and `ssls` query parameters.

## Before adding ADCIRC at SSLS locations

- Preserve the surveyed sensor elevation and the exact station coordinates used to select/interpolate the ADCIRC node.
- Decide whether ADCIRC station time series will be keyed by the SSLS Thing ID, hardware `sensorId`, or a separate stable model-location ID; do not assume the SensorThings numeric ID is permanent.
- Record mesh/node identity, horizontal distance to the sensor, wet/dry behavior, model datum, and any datum transformation/version in generated metadata.
- Confirm that model output is NAVD88 feet before plotting it with normalized observations.
- Consider whether the 19-station reliable/surveyed subset remains the operational comparison set, and establish a maintained source of truth rather than copying metadata indefinitely.
- Add QC treatment deliberately. The SensorThings endpoint supplies the raw stream; the packaged `filtered_water_level` applies a nearest-neighbor outlier filter that is not exposed as a separate live datastream.
