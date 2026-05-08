import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  ZoomControl
} from "react-leaflet";
import hurricaneTdIcon from "../assets/hurricane_td_icon.png";
import hurricaneTsIcon from "../assets/hurricane_ts_icon.png";
import hurricaneCat1Icon from "../assets/hurricane_cat1_icon.png";
import hurricaneCat2Icon from "../assets/hurricane_cat2_icon.png";
import hurricaneCat3Icon from "../assets/hurricane_cat3_icon.png";
import hurricaneCat4Icon from "../assets/hurricane_cat4_icon.png";
import hurricaneCat5Icon from "../assets/hurricane_cat5_icon.png";

const TITILER_BASE_URL = "https://tiles.gafloodforecast.com";

const stationIcon = new L.DivIcon({
  className: "station-marker-wrapper",
  html: '<div class="station-marker-dot"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

const pinnedIcon = L.divIcon({
  className: "pinned-marker",
  html: '<div class="pinned-marker-dot"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const BASEMAP_CONFIG = {
  light: {
    base: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "&copy; OpenStreetMap contributors",
      subdomains: "abc",
      maxZoom: 19
    },
    labels: null
  },
  dark: {
    base: {
      url: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 20
    },
    labels: {
      url: "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 20
    }
  },
  topo: {
    base: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri",
      maxZoom: 19
    },
    labels: null
  },
  aerial: {
    base: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri",
      maxZoom: 19
    },
    labels: {
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri",
      maxZoom: 19
    }
  }
};

const RESCALE_MAP = {
  maxele: "0,9",
  storm_maxele: "0,9",
  daily_maxele: "0,5",
  swan_HS_max: "0,20"
};

function getRasterStyleKey(layerKey, hurricaneMeta) {
  if (!hurricaneMeta && layerKey === "maxele") {
    return "daily_maxele";
  }

  if (hurricaneMeta && layerKey === "maxele") {
    return "storm_maxele";
  }

  return layerKey;
}

const DAILY_DEFAULT_BOUNDS = L.latLngBounds(
  [27.2, -85.5],
  [33.2, -77]
);

function knotsToMph(knots) {
  const value = Number(knots);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1.15078);
}

function formatWindMph(value) {
  const mph = knotsToMph(value);
  return mph != null ? `${mph} mph` : "—";
}

function formatAdvisoryTime(value) {
  if (value == null) return "—";

  const raw = String(value).trim();
  const digits = raw.replace(/\D/g, "");

  if (digits.length === 12) {
    const year = digits.slice(0, 4);
    const month = digits.slice(4, 6);
    const day = digits.slice(6, 8);
    const hour = digits.slice(8, 10);
    const minute = digits.slice(10, 12);
    return `${month}/${day}/${year} ${hour}:${minute} UTC`;
  }

  if (digits.length === 10) {
    const year = digits.slice(0, 4);
    const month = digits.slice(4, 6);
    const day = digits.slice(6, 8);
    const hour = digits.slice(8, 10);
    return `${month}/${day}/${year} ${hour}:00 UTC`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return (
      parsed.toLocaleString("en-US", {
        timeZone: "UTC",
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }) + " UTC"
    );
  }

  return raw;
}

function parseCompactUtcTime(value) {
  if (!value) return null;

  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 10) return null;

  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);
  const hour = digits.slice(8, 10);
  const minute = digits.length >= 12 ? digits.slice(10, 12) : "00";

  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatUtcDate(date) {
  if (!date) return "—";

  return (
    date.toLocaleString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }) + " UTC"
  );
}

function getStormCategoryFromKnots(knots) {
  const value = Number(knots);
  if (!Number.isFinite(value)) return "unknown";
  if (value >= 137) return "cat5";
  if (value >= 113) return "cat4";
  if (value >= 96) return "cat3";
  if (value >= 83) return "cat2";
  if (value >= 64) return "cat1";
  if (value >= 34) return "ts";
  return "td";
}

function getStormTypeLabel(category) {
  switch (category) {
    case "td":
      return "Tropical Depression";
    case "ts":
      return "Tropical Storm";
    case "cat1":
      return "Hurricane (Cat 1)";
    case "cat2":
      return "Hurricane (Cat 2)";
    case "cat3":
      return "Hurricane (Cat 3)";
    case "cat4":
      return "Hurricane (Cat 4)";
    case "cat5":
      return "Hurricane (Cat 5)";
    default:
      return "—";
  }
}

function getHurricaneIconUrl(category) {
  switch (category) {
    case "td":
      return hurricaneTdIcon;
    case "ts":
      return hurricaneTsIcon;
    case "cat1":
      return hurricaneCat1Icon;
    case "cat2":
      return hurricaneCat2Icon;
    case "cat3":
      return hurricaneCat3Icon;
    case "cat4":
      return hurricaneCat4Icon;
    case "cat5":
      return hurricaneCat5Icon;
    default:
      return hurricaneTdIcon;
  }
}

function createHurricanePointIcon(segment, maxWindKt) {
  const category = getStormCategoryFromKnots(maxWindKt);
  const iconUrl = getHurricaneIconUrl(category);
  const isForecastLike = segment === "forecast" || segment === "simulation";
  const size = isForecastLike ? 32 : 24;

  return L.icon({
    iconUrl,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    className: isForecastLike
      ? "hurricane-image-icon forecast"
      : "hurricane-image-icon past"
  });
}

function buildHurricanePointTooltip(properties = {}) {
  const category = getStormCategoryFromKnots(properties.maxWindKt);
  const stormLabel = getStormTypeLabel(category);
  const advisoryDate = parseCompactUtcTime(properties.advisoryTime);
  const forecastHour = Number(properties.forecastHour);
  const isForecastLike =
    properties.segment === "forecast" || properties.segment === "simulation";

  let displayTime = formatAdvisoryTime(properties.advisoryTime);

  if (advisoryDate && Number.isFinite(forecastHour)) {
    const derived = new Date(advisoryDate.getTime() + forecastHour * 3600 * 1000);
    displayTime = formatUtcDate(derived);
  }

  const forecastLine =
    isForecastLike && properties.forecastHour != null
      ? `<div><strong>Forecast:</strong> +${properties.forecastHour} hr</div>`
      : "";

  return `
    <div class="hurricane-tooltip">
      <div><strong>${stormLabel}</strong></div>
      ${forecastLine}
      <div><strong>Valid Time:</strong> ${displayTime}</div>
      <div><strong>Wind:</strong> ${formatWindMph(properties.maxWindKt)}</div>
    </div>
  `;
}

function MapEffects({ bounds, shouldFitBounds }) {
  const map = useMap();

  useEffect(() => {
    if (shouldFitBounds && bounds) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [map, bounds, shouldFitBounds]);

  return null;
}

function MapBridge({ mapRef, onMapClick, onReady }) {
  const map = useMap();

  useEffect(() => {
    mapRef.current = map;
    onReady?.(map);

    const handleClick = (e) => onMapClick?.(e);
    map.on("click", handleClick);

    return () => {
      map.off("click", handleClick);
    };
  }, [map, mapRef, onMapClick, onReady]);

  return null;
}

function MapLegend({ layerConfig }) {
  if (!layerConfig) return null;

  return (
    <div className="map-legend">
      <div className="map-legend-title">
        {layerConfig.legendTitle || layerConfig.label || "Legend"}
      </div>
      <div
        className="map-legend-bar"
        style={{ background: layerConfig.legendGradient }}
      />
      <div className="map-legend-labels">
        {(layerConfig.legendTicks || []).map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </div>
  );
}

function getDisplayLayerConfig(layerConfig, hurricaneMeta) {
  if (!layerConfig) return null;

    if (!hurricaneMeta && layerConfig.key === "maxele") {
    return {
      ...layerConfig,
      legendTitle: "Water Level (ft, NAVD88)",
      legendGradient:
        "linear-gradient(to right, rgb(0,0,255), rgb(0,80,255), rgb(0,130,255), rgb(0,200,255), rgb(0,255,180), rgb(0,255,0), rgb(255,255,0), rgb(255,140,0), rgb(255,0,0))",
      legendTicks: ["0", "1", "2", "3", "4", "5+"]
    };
  }

  if (hurricaneMeta && layerConfig.key === "maxele") {
    return {
      ...layerConfig,
      legendTitle: "Water Level (ft, NAVD88)",
      legendGradient:
        "linear-gradient(to right, rgb(0,0,255), rgb(0,80,255), rgb(0,130,255), rgb(0,200,255), rgb(0,255,180), rgb(0,255,0), rgb(255,255,0), rgb(255,140,0), rgb(255,0,0))",
      legendTicks: ["0", "2", "4", "6", "8", "9+"]
    };
  }

  return layerConfig;
}

export default function LeafletMap({
  stations,
  stationsVisible,
  opacity,
  onStationSelect,
  rasterUrl,
  onRasterStatusChange,
  basemap,
  pinnedValue,
  onPinValueChange,
  layerConfig,
  hurricaneMeta,
  runBaseUrl,
  showHurricaneCone,
  showHurricaneTrackPoints
}) {
  const bounds = useMemo(() => DAILY_DEFAULT_BOUNDS, []);

  const currentBasemap = BASEMAP_CONFIG[basemap] || BASEMAP_CONFIG.light;
  const currentBasemapBase = currentBasemap.base;
  const currentBasemapLabels = currentBasemap.labels;

  const mapRef = useRef(null);
  const coneLayerRef = useRef(null);
  const officialTrackLayerRef = useRef(null);
  const simTrackLayerRef = useRef(null);
  const officialPointsLayerRef = useRef(null);
  const simPointsLayerRef = useRef(null);

  const spinnerTimerRef = useRef(null);
  const fallbackReadyTimerRef = useRef(null);

  const lastHurricaneStormKeyRef = useRef(null);
  const hasFitHurricaneStormRef = useRef(false);

  const hurricaneStormKey = useMemo(() => {
    if (!hurricaneMeta) return null;

    return (
      hurricaneMeta.stormId ||
      hurricaneMeta.stormName ||
      hurricaneMeta.name ||
      hurricaneMeta.advisoryStormName ||
      null
    );
  }, [hurricaneMeta]);

  const [mapReady, setMapReady] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);

  const rasterVersion = useMemo(() => {
    if (!rasterUrl) return "0";

    const parts = rasterUrl.split("/").filter(Boolean);

    const year = parts[parts.length - 6];
    const month = parts[parts.length - 5];
    const day = parts[parts.length - 4];
    const run = parts[parts.length - 3];

    if (year && month && day && run) {
      return `${year}${month}${day}${run}`;
    }

    return String(Date.now());
  }, [rasterUrl]);

    const tileUrl = useMemo(() => {
      if (!rasterUrl || !layerConfig?.key) return null;

      const styleKey = getRasterStyleKey(layerConfig.key, hurricaneMeta);
      const rescale = RESCALE_MAP[styleKey] || "0,1";
      const cacheBustedRasterUrl = `${rasterUrl}?v=${encodeURIComponent(rasterVersion)}`;

      return (
        `${TITILER_BASE_URL}/styled/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png` +
        `?url=${encodeURIComponent(cacheBustedRasterUrl)}` +
        `&style=${encodeURIComponent(styleKey)}` +
        `&rescale=${encodeURIComponent(rescale)}` +
        `&nodata=-99999` +
        `&resampling=bilinear` +
        `&cb=${encodeURIComponent(rasterVersion)}`
      );
    }, [rasterUrl, layerConfig?.key, rasterVersion, hurricaneMeta]);

  const displayLayerConfig = useMemo(
    () => getDisplayLayerConfig(layerConfig, hurricaneMeta),
    [layerConfig, hurricaneMeta]
  );

  useEffect(() => {
    if (spinnerTimerRef.current) {
      window.clearTimeout(spinnerTimerRef.current);
      spinnerTimerRef.current = null;
    }
    if (fallbackReadyTimerRef.current) {
      window.clearTimeout(fallbackReadyTimerRef.current);
      fallbackReadyTimerRef.current = null;
    }

    if (!tileUrl) {
      setShowSpinner(false);
      onRasterStatusChange?.({
        state: "idle",
        message: "No raster selected."
      });
      return;
    }

    onRasterStatusChange?.({
      state: "loading",
      message: `Loading ${layerConfig?.label || "raster"}…`
    });

    spinnerTimerRef.current = window.setTimeout(() => {
      setShowSpinner(true);
    }, 250);

    fallbackReadyTimerRef.current = window.setTimeout(() => {
      setShowSpinner(false);
      onRasterStatusChange?.({
        state: "ready",
        message: `Loaded ${layerConfig?.label || "raster"}`
      });
    }, 2500);

    return () => {
      if (spinnerTimerRef.current) {
        window.clearTimeout(spinnerTimerRef.current);
        spinnerTimerRef.current = null;
      }
      if (fallbackReadyTimerRef.current) {
        window.clearTimeout(fallbackReadyTimerRef.current);
        fallbackReadyTimerRef.current = null;
      }
    };
  }, [tileUrl, layerConfig?.label, onRasterStatusChange]);

  function handleMapClick(e) {
    onPinValueChange?.({
      text: "Point selected",
      latlng: e.latlng
    });
  }

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const map = mapRef.current;

    function clear(ref) {
      if (ref.current) {
        map.removeLayer(ref.current);
        ref.current = null;
      }
    }

    clear(coneLayerRef);
    clear(officialTrackLayerRef);
    clear(simTrackLayerRef);
    clear(officialPointsLayerRef);
    clear(simPointsLayerRef);

    if (!hurricaneMeta?.hasOverlays || !runBaseUrl) return;

    const stormChanged = lastHurricaneStormKeyRef.current !== hurricaneStormKey;
    if (stormChanged) {
      lastHurricaneStormKeyRef.current = hurricaneStormKey;
      hasFitHurricaneStormRef.current = false;
    }

    const buildUrl = (file) =>
      file ? `${runBaseUrl.replace(/\/$/, "")}/${file}` : null;

    const coneUrl = buildUrl(hurricaneMeta.coneGeojsonFile);
    const officialTrackUrl = buildUrl(hurricaneMeta.trackGeojsonFile);
    const officialPointsUrl = buildUrl(hurricaneMeta.pointsGeojsonFile);
    const simTrackUrl = buildUrl(hurricaneMeta.simulationTrackGeojsonFile);
    const simPointsUrl = buildUrl(hurricaneMeta.simulationPointsGeojsonFile);
    const SHOW_CONE = false; // Temporary toggle until we can confirm cone data is correct and update styling as needed

    let cancelled = false;

    async function load() {
      try {
        if (SHOW_CONE && showHurricaneCone) {
          const res = await fetch(coneUrl);
          if (!res.ok) {
            throw new Error(`Cone fetch failed: ${res.status} ${res.statusText} ${coneUrl}`);
          }
          const data = await res.json();

          if (!cancelled) {
            coneLayerRef.current = L.geoJSON(data, {
              coordsToLatLng: (coords) => [coords[1], coords[0]],
              style: {
                weight: 1.5,
                opacity: 0.9,
                fillOpacity: 0.08
              }
            }).addTo(map);
          }
        }

        if (showHurricaneTrackPoints && officialTrackUrl) {
          const res = await fetch(officialTrackUrl);
          if (!res.ok) {
            throw new Error(
              `Official track fetch failed: ${res.status} ${res.statusText} ${officialTrackUrl}`
            );
          }
          const data = await res.json();

          if (!cancelled) {
            officialTrackLayerRef.current = L.geoJSON(data, {
              coordsToLatLng: (coords) => [coords[1], coords[0]],
              filter: (feature) => feature?.properties?.segment === "past",
              style: () => ({
                weight: 2,
                opacity: 0.7,
                dashArray: "6 4"
              })
            }).addTo(map);
          }
        }

        if (showHurricaneTrackPoints && simTrackUrl) {
          const res = await fetch(simTrackUrl);
          if (!res.ok) {
            throw new Error(
              `Simulation track fetch failed: ${res.status} ${res.statusText} ${simTrackUrl}`
            );
          }
          const data = await res.json();

          if (!cancelled) {
            simTrackLayerRef.current = L.geoJSON(data, {
              coordsToLatLng: (coords) => [coords[1], coords[0]],
              style: (feature) => {
                const p = feature?.properties || {};
                const isForecastLike =
                  p.segment === "forecast" || p.segment === "simulation";

                return {
                  weight: isForecastLike ? 3 : 2,
                  opacity: isForecastLike ? 1 : 0.7,
                  dashArray: isForecastLike ? null : "6 4"
                };
              }
            }).addTo(map);
          }
        } else if (showHurricaneTrackPoints && officialTrackUrl) {
          const res = await fetch(officialTrackUrl);
          if (!res.ok) {
            throw new Error(
              `Official track fetch failed: ${res.status} ${res.statusText} ${officialTrackUrl}`
            );
          }
          const data = await res.json();

          if (!cancelled) {
            simTrackLayerRef.current = L.geoJSON(data, {
              coordsToLatLng: (coords) => [coords[1], coords[0]],
              filter: (feature) => feature?.properties?.segment === "forecast",
              style: {
                weight: 3,
                opacity: 1,
                dashArray: null
              }
            }).addTo(map);
          }
        }

        if (showHurricaneTrackPoints && officialPointsUrl) {
          const res = await fetch(officialPointsUrl);
          if (!res.ok) {
            throw new Error(
              `Official points fetch failed: ${res.status} ${res.statusText} ${officialPointsUrl}`
            );
          }
          const data = await res.json();

          if (!cancelled) {
            officialPointsLayerRef.current = L.geoJSON(data, {
              coordsToLatLng: (coords) => [coords[1], coords[0]],
              filter: (feature) => feature?.properties?.segment === "past",
              pointToLayer: (feature, latlng) => {
                const p = feature.properties || {};
                return L.marker(latlng, {
                  icon: createHurricanePointIcon(p.segment, p.maxWindKt),
                  zIndexOffset: 100
                });
              },
              onEachFeature: (feature, layer) => {
                const p = feature.properties || {};
                layer.bindTooltip(buildHurricanePointTooltip(p));
              }
            }).addTo(map);
          }
        }

        if (showHurricaneTrackPoints && simPointsUrl) {
          const res = await fetch(simPointsUrl);
          if (!res.ok) {
            throw new Error(
              `Simulation points fetch failed: ${res.status} ${res.statusText} ${simPointsUrl}`
            );
          }
          const data = await res.json();

          if (!cancelled) {
            simPointsLayerRef.current = L.geoJSON(data, {
              coordsToLatLng: (coords) => [coords[1], coords[0]],
              pointToLayer: (feature, latlng) => {
                const p = feature.properties || {};
                return L.marker(latlng, {
                  icon: createHurricanePointIcon(p.segment, p.maxWindKt),
                  zIndexOffset:
                    p.segment === "forecast" || p.segment === "simulation"
                      ? 200
                      : 100
                });
              },
              onEachFeature: (feature, layer) => {
                const p = feature.properties || {};
                layer.bindTooltip(buildHurricanePointTooltip(p));
              }
            }).addTo(map);
          }
        } else if (showHurricaneTrackPoints && officialPointsUrl) {
          const res = await fetch(officialPointsUrl);
          if (!res.ok) {
            throw new Error(
              `Official points fetch failed: ${res.status} ${res.statusText} ${officialPointsUrl}`
            );
          }
          const data = await res.json();

          if (!cancelled) {
            simPointsLayerRef.current = L.geoJSON(data, {
              coordsToLatLng: (coords) => [coords[1], coords[0]],
              filter: (feature) => feature?.properties?.segment === "forecast",
              pointToLayer: (feature, latlng) => {
                const p = feature.properties || {};
                return L.marker(latlng, {
                  icon: createHurricanePointIcon(p.segment, p.maxWindKt),
                  zIndexOffset: 200
                });
              },
              onEachFeature: (feature, layer) => {
                const p = feature.properties || {};
                layer.bindTooltip(buildHurricanePointTooltip(p));
              }
            }).addTo(map);
          }
        }

        const overlayBounds = L.latLngBounds([]);

        if (coneLayerRef.current) overlayBounds.extend(coneLayerRef.current.getBounds());
        if (officialTrackLayerRef.current) overlayBounds.extend(officialTrackLayerRef.current.getBounds());
        if (simTrackLayerRef.current) overlayBounds.extend(simTrackLayerRef.current.getBounds());
        if (officialPointsLayerRef.current) overlayBounds.extend(officialPointsLayerRef.current.getBounds());
        if (simPointsLayerRef.current) overlayBounds.extend(simPointsLayerRef.current.getBounds());

        if (
          !cancelled &&
          overlayBounds.isValid() &&
          !hasFitHurricaneStormRef.current
        ) {
          map.fitBounds(overlayBounds, {
            padding: [30, 30],
            animate: true,
            duration: 0.5
          });
          hasFitHurricaneStormRef.current = true;
        }
      } catch (err) {
        console.error("Hurricane overlay error:", err);
      }
    }

    load();

    return () => {
      cancelled = true;
      clear(coneLayerRef);
      clear(officialTrackLayerRef);
      clear(simTrackLayerRef);
      clear(officialPointsLayerRef);
      clear(simPointsLayerRef);
    };
  }, [
    hurricaneMeta,
    runBaseUrl,
    mapReady,
    showHurricaneCone,
    showHurricaneTrackPoints,
    hurricaneStormKey
  ]);

  return (
    <div className="map-shell">
      {showSpinner && (
        <div className="spinner-overlay">
          <div className="spinner" />
          <div className="spinner-text">Loading raster…</div>
        </div>
      )}

      <MapContainer
        center={[31.5, -81.0]}
        zoom={6}
        className="leaflet-map"
        zoomControl={false}
      >
        <MapBridge
          mapRef={mapRef}
          onMapClick={handleMapClick}
          onReady={() => setMapReady(true)}
        />

        <TileLayer
          url={currentBasemapBase.url}
          attribution={currentBasemapBase.attribution}
          subdomains={currentBasemapBase.subdomains}
          maxZoom={currentBasemapBase.maxZoom}
        />

        {currentBasemapLabels && (
          <TileLayer
            url={currentBasemapLabels.url}
            attribution={currentBasemapLabels.attribution}
            subdomains={currentBasemapLabels.subdomains}
            maxZoom={currentBasemapLabels.maxZoom}
            pane="overlayPane"
          />
        )}

        <ZoomControl position="topright" />

        {bounds && (
          <MapEffects
            bounds={bounds}
            shouldFitBounds={!hurricaneMeta?.hasOverlays}
          />
        )}

        {tileUrl && (
          <TileLayer
            key={`${layerConfig?.key || "raster"}-${rasterUrl}-${rasterVersion}`}
            url={tileUrl}
            opacity={opacity / 100}
            updateWhenZooming={false}
            updateWhenIdle={true}
            keepBuffer={1}
            eventHandlers={{
              tileload: () => {
                if (spinnerTimerRef.current) {
                  window.clearTimeout(spinnerTimerRef.current);
                  spinnerTimerRef.current = null;
                }
                if (fallbackReadyTimerRef.current) {
                  window.clearTimeout(fallbackReadyTimerRef.current);
                  fallbackReadyTimerRef.current = null;
                }

                setShowSpinner(false);
                onRasterStatusChange?.({
                  state: "ready",
                  message: `Loaded ${layerConfig?.label || "raster"}`
                });
              },
              load: () => {
                if (spinnerTimerRef.current) {
                  window.clearTimeout(spinnerTimerRef.current);
                  spinnerTimerRef.current = null;
                }
                if (fallbackReadyTimerRef.current) {
                  window.clearTimeout(fallbackReadyTimerRef.current);
                  fallbackReadyTimerRef.current = null;
                }

                setShowSpinner(false);
                onRasterStatusChange?.({
                  state: "ready",
                  message: `Loaded ${layerConfig?.label || "raster"}`
                });
              },
              tileerror: (e) => {
                console.error("Raster tile failed:", {
                  tileUrl,
                  layerKey: layerConfig?.key,
                  event: e
                });
              }
            }}
          />
        )}

        {pinnedValue?.latlng && (
          <Marker
            position={[pinnedValue.latlng.lat, pinnedValue.latlng.lng]}
            icon={pinnedIcon}
          />
        )}

        {stationsVisible &&
          stations.map((station) => (
            <Marker
              key={station.id}
              position={[station.lat, station.lon]}
              icon={stationIcon}
              eventHandlers={{ click: () => onStationSelect(station) }}
            />
          ))}
      </MapContainer>

      <MapLegend layerConfig={displayLayerConfig} />
    </div>
  );
}