import { OBSERVATION_PROVIDERS } from "../config/observations.js";

function noaaStation(id, name, lat, lon) {
  return {
    id,
    name,
    lat,
    lon,
    provider: OBSERVATION_PROVIDERS.NOAA,
    hasObservations: true,
    hasModelData: true,
    observationUnit: "ft",
    observationDatum: "NAVD88"
  };
}

function sslsStation({
  thingId,
  packageId,
  datastreamId,
  sensorId,
  modelStationId,
  name,
  lat,
  lon,
  elevationNavd88Meters
}) {
  return {
    id: thingId == null ? `reliable-${packageId}` : String(thingId),
    sensorId,
    modelStationId,
    observationDatastreamId: datastreamId == null ? null : String(datastreamId),
    name,
    lat,
    lon,
    elevationNavd88Meters,
    provider: OBSERVATION_PROVIDERS.SSLS,
    hasObservations: datastreamId != null && Number.isFinite(elevationNavd88Meters),
    hasModelData: true,
    observationUnit: "ft",
    observationDatum: "NAVD88"
  };
}

function usgsStation({
  id,
  name,
  lat,
  lon,
  timeSeriesId,
  parameterCode,
  datum,
  datumOffsetFeet
}) {
  return {
    id,
    modelStationId: id,
    name,
    lat,
    lon,
    provider: OBSERVATION_PROVIDERS.USGS,
    hasObservations: true,
    hasModelData: true,
    observationStatus: "unknown",
    observationUnit: "ft",
    observationDatum: datum,
    observationParameterCode: parameterCode,
    observationTimeSeriesId: timeSeriesId,
    datumOffsetFeet
  };
}

const NOAA_GEORGIA = [
  noaaStation("8665530", "Charleston", 32.781667, -79.923333),
  noaaStation("8670870", "Fort Pulaski", 32.0346, -80.9025),
  noaaStation("8720030", "Fernandina Beach", 30.6717, -81.4667),
  noaaStation("8720218", "Mayport", 30.39833, -81.42833)
];

export const USGS_GEORGIA_STATIONS = [
  usgsStation({
    id: "02228295",
    name: "Cumberland Sound at Sea Camp Dock",
    lat: 30.7643333333333,
    lon: -81.4713611111111,
    timeSeriesId: "9c9af1535fb140be8fbbf35232b35de3",
    parameterCode: "00065",
    datum: "NAVD88",
    datumOffsetFeet: 0
  }),
  usgsStation({
    id: "02226180",
    name: "Brunswick River at St. Simons Island",
    lat: 31.12675,
    lon: -81.4021388888889,
    timeSeriesId: "cc81281a67c5466dbe4dda9bb0b1ea8f",
    parameterCode: "00065",
    datum: "NAVD88",
    datumOffsetFeet: 0
  }),
  usgsStation({
    id: "022035975",
    name: "Hudson Creek at Meridian Landing",
    lat: 31.4533333333333,
    lon: -81.3627777777778,
    timeSeriesId: "29cfd651986f4a59969caa774b826eee",
    parameterCode: "00065",
    datum: "NAVD88",
    datumOffsetFeet: 0
  })
];

// Current SensorThings entries that overlap the SSLS project's published
// "Most Reliable Sensors" package. Test units, environmental-only devices,
// unsurveyed stations, and package stations no longer in the live API are excluded.
export const SSLS_RELIABLE_STATIONS = [
  sslsStation({ thingId: 69, datastreamId: 122, sensorId: "gt-envsense-022", modelStationId: "SSLS01", name: "Fort Pulaski (A)", lat: 32.03455, lon: -80.902494, elevationNavd88Meters: 3.606 }),
  sslsStation({ packageId: 1, modelStationId: "SSLS02", name: "Hutchinson Island", lat: 32.085707, lon: -81.084099 }),
  sslsStation({ thingId: 14, datastreamId: 24, sensorId: "gt-envsense-009", modelStationId: "SSLS03", name: "Walthour Road", lat: 32.018171, lon: -80.962163, elevationNavd88Meters: 2.768 }),
  sslsStation({ packageId: 3, modelStationId: "SSLS04", name: "Oatland Island Road", lat: 32.052507, lon: -81.011631 }),
  sslsStation({ thingId: 49, datastreamId: 63, sensorId: "gt-envsense-013", modelStationId: "SSLS05", name: "Hunt Drive on Burnside Island", lat: 31.928811, lon: -81.086168, elevationNavd88Meters: 3.512 }),
  sslsStation({ thingId: 64, datastreamId: 107, sensorId: "gt-envsense-029", modelStationId: "SSLS06", name: "Sullivan Street", lat: 31.930439, lon: -81.092435, elevationNavd88Meters: 2.513 }),
  sslsStation({ packageId: 6, modelStationId: "SSLS07", name: "Hwy 80 at Grays Creek", lat: 32.038669, lon: -81.031204 }),
  sslsStation({ thingId: 67, datastreamId: 116, sensorId: "gt-envsense-041", modelStationId: "SSLS08", name: "Faye Drive on Burnside Island", lat: 31.92835, lon: -81.08402, elevationNavd88Meters: 3.708 }),
  sslsStation({ thingId: 54, datastreamId: 77, sensorId: "gt-envsense-035", modelStationId: "SSLS09", name: "Hwy 80 at Chimney Creek", lat: 32.01831, lon: -80.850964, elevationNavd88Meters: 3.213 }),
  sslsStation({ thingId: 62, datastreamId: 101, sensorId: "gt-envsense-017", modelStationId: "SSLS10", name: "Shipyard Road", lat: 31.936685, lon: -81.102928, elevationNavd88Meters: 3.085 }),
  sslsStation({ thingId: 70, datastreamId: 125, sensorId: "gt-envsense-038", modelStationId: "SSLS11", name: "Fort Pulaski (B)", lat: 32.034488, lon: -80.902507, elevationNavd88Meters: 3.618 }),
  sslsStation({ thingId: 53, datastreamId: 74, sensorId: "gt-envsense-027", modelStationId: "SSLS12", name: "Lazaretto Creek Fishing Pier", lat: 32.014112, lon: -80.884092, elevationNavd88Meters: 2.309 }),
  sslsStation({ thingId: 7, datastreamId: 11, sensorId: "gt-envsense-057", modelStationId: "SSLS13", name: "Coffee Bluff Marina", lat: 31.935783, lon: -81.153906, elevationNavd88Meters: 2.536 }),
  sslsStation({ thingId: 5, datastreamId: 7, sensorId: "gt-envsense-011", modelStationId: "SSLS14", name: "Bull River Marina", lat: 32.034717, lon: -80.959417, elevationNavd88Meters: 3.041 }),
  sslsStation({ thingId: 61, datastreamId: 98, sensorId: "gt-envsense-015", modelStationId: "SSLS15", name: "Diamond Causeway at Shipyard Creek", lat: 31.951711, lon: -81.084056, elevationNavd88Meters: 2.794 }),
  sslsStation({ packageId: 15, modelStationId: "SSLS16", name: "Rose Dhu Island", lat: 31.932421, lon: -81.139343 }),
  sslsStation({ thingId: 74, datastreamId: 137, sensorId: "gt-envsense-020", modelStationId: "SSLS17", name: "Skidaway Road at Herb River", lat: 31.98277, lon: -81.07081, elevationNavd88Meters: 2.406 }),
  sslsStation({ thingId: 63, datastreamId: 104, sensorId: "gt-envsense-024", modelStationId: "SSLS18", name: "Solomon Bridge", lat: 31.993082, lon: -81.055977, elevationNavd88Meters: 4.807 }),
  sslsStation({ thingId: 59, datastreamId: 92, sensorId: "gt-envsense-025", modelStationId: "SSLS19", name: "Dean Forest Road at Harden Canal", lat: 32.050608, lon: -81.213645, elevationNavd88Meters: 2.229 }),
  sslsStation({ thingId: 66, datastreamId: 113, sensorId: "gt-envsense-032", modelStationId: "SSLS20", name: "LaRoche Avenue at Nottingham Creek", lat: 32.000149, lon: -81.063662, elevationNavd88Meters: 2.432 }),
  sslsStation({ thingId: 68, datastreamId: 119, sensorId: "gt-envsense-039", modelStationId: "SSLS21", name: "Wilmington Park Canal", lat: 31.987188, lon: -80.994272, elevationNavd88Meters: 3.022 }),
  sslsStation({ thingId: 55, datastreamId: 80, sensorId: "gt-envsense-098", modelStationId: "SSLS22", name: "Turner Creek Boat Ramp", lat: 32.020471, lon: -80.991889, elevationNavd88Meters: 2.492 }),
  sslsStation({ thingId: 58, datastreamId: 89, sensorId: "gt-envsense-023", modelStationId: "SSLS23", name: "Hwy 21 at St Augustine Creek", lat: 32.172647, lon: -81.187966, elevationNavd88Meters: 2.75 })
];

export const STATIONS_BY_REGION = {
  Georgia: [...NOAA_GEORGIA, ...SSLS_RELIABLE_STATIONS, ...USGS_GEORGIA_STATIONS],
  "Western North Atlantic": [
    noaaStation("8771341", "Galveston Bay Entrance, North Jetty", 29.356667, -94.725),
    noaaStation("8770822", "Texas Point, Sabine Pass", 29.69, -93.841667),
    noaaStation("8761305", "Shell Beach", 29.868333, -89.673333),
    noaaStation("8735180", "Dauphin Island", 30.25, -88.075),
    noaaStation("8729210", "Panama City Beach", 30.213333, -85.878333),
    noaaStation("8727520", "Cedar Key", 29.135, -83.031667),
    noaaStation("8726724", "Clearwater Beach", 27.978333, -82.831667),
    noaaStation("8722670", "Lake Worth Pier, Atlantic Ocean", 26.613333, -80.033333),
    noaaStation("8721604", "Trident Pier, Port Canaveral", 28.415, -80.593333),
    ...NOAA_GEORGIA.slice().reverse(),
    noaaStation("8661070", "Springmaid Pier", 33.655, -78.918333),
    noaaStation("8658163", "Wrightsville Beach", 34.213333, -77.786667),
    noaaStation("8570283", "Ocean City Inlet", 38.328333, -75.091667),
    noaaStation("8531680", "Sandy Hook", 40.466667, -74.01),
    noaaStation("8418150", "Portland", 43.658333, -70.243333),
    noaaStation("8411060", "Cutler Farris Wharf", 44.656667, -67.21)
  ],
  "U.S. East Coast": []
};
