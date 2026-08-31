import React, { useEffect, useMemo, useRef, useState } from "react";
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import TopBar from "./components/TopBar.jsx";
import LeafletMap from "./components/LeafletMap.jsx";
import StationPanel from "./components/StationPanel.jsx";
import { STATIONS_BY_REGION } from "./data/stations.js";
import { LAYER_CONFIGS } from "./config/layers.js";

const S3_BASE_URL = "https://uga-coast-forecasting.s3.us-east-1.amazonaws.com";
const MANIFEST_URL = `${S3_BASE_URL}/raster-manifest.json`;
const MODES = { DAILY: "daily", HURRICANE: "hurricane", ARCHIVE: "archive" };
const VALID_MODES = new Set(Object.values(MODES));
const VALID_LAYERS = new Set(["maxele", "swan_HS_max"]);
const VALID_BASEMAPS = new Set(["aerial", "charcoal", "light", "topo"]);

const ADCIRC_TIMESERIES_API =
  "https://tiles.gafloodforecast.com/adcirc/timeseries";

function buildS3PrefixFromRunBaseUrl(runBaseUrl) {
  if (!runBaseUrl) return null;

  return runBaseUrl.replace(
    "https://uga-coast-forecasting.s3.us-east-1.amazonaws.com",
    "s3://uga-coast-forecasting"
  );
}

function buildClickedPointForecastUrl(runBaseUrl, latlng) {
  const s3Prefix = buildS3PrefixFromRunBaseUrl(runBaseUrl);
  if (!s3Prefix || !latlng) return null;

  const params = new URLSearchParams({
    s3_prefix: s3Prefix,
    lat: String(latlng.lat),
    lon: String(latlng.lng)
  });

  return `${ADCIRC_TIMESERIES_API}?${params.toString()}`;
}

function buildStationAnalysisUrl(runBaseUrl, stationId) {
  const s3Prefix = buildS3PrefixFromRunBaseUrl(runBaseUrl);
  if (!s3Prefix || !stationId) return null;

  const params = new URLSearchParams({
    s3_prefix: s3Prefix,
    station_id: String(stationId),
    hours: "48"
  });

  return `${ADCIRC_TIMESERIES_API.replace("/timeseries", "/station-analysis")}?${params.toString()}`;
}

function sortRuns(runs) {
  return [...runs].sort((a, b) => {
    const aStr = String(a).toLowerCase();
    const bStr = String(b).toLowerCase();

    if (aStr === "ofcl") return -1;
    if (bStr === "ofcl") return 1;

    const aClean = aStr.replace("z", "");
    const bClean = bStr.replace("z", "");

    const aNum = /^\d+$/.test(aClean) ? parseInt(aClean, 10) : null;
    const bNum = /^\d+$/.test(bClean) ? parseInt(bClean, 10) : null;

    if (aNum != null && bNum != null) return aNum - bNum;
    if (aNum != null) return -1;
    if (bNum != null) return 1;

    return aStr.localeCompare(bStr);
  });
}

function splitDateParts(dateStr) {
  const [year, month, day] = dateStr.split("-");
  return { year, month, day };
}

function isStormMode(mode) {
  return mode === MODES.HURRICANE || mode === MODES.ARCHIVE;
}

function getModeMeshes(manifest, mode) {
  const section = manifest?.[mode];
  const meshes = section?.meshes || {};

  return Object.entries(meshes).map(([key, value]) => ({
    key,
    label: value?.label || value?.region || key,
    shortLabel: value?.shortLabel || "",
    region: value?.region || key,
    isDefault: Boolean(value?.default)
  }));
}

function getDefaultMeshKey(manifest, mode) {
  const meshes = getModeMeshes(manifest, mode);
  const preferred = meshes.find((mesh) => mesh.isDefault);
  return preferred?.key || meshes[0]?.key || "";
}

function getHurricaneStorms(manifest, selectedMesh) {
  const storms = manifest?.hurricane?.meshes?.[selectedMesh]?.storms || {};

  return Object.entries(storms)
    .sort(([, a], [, b]) => {
      const aLatest = Object.keys(a?.advisories || {}).sort().reverse()[0] || "";
      const bLatest = Object.keys(b?.advisories || {}).sort().reverse()[0] || "";

      // Newest advisory first
      return bLatest.localeCompare(aLatest);
    })
    .map(([key, value]) => ({
      key,
      label: value?.label || key
    }));
}

function getArchiveYears(manifest, selectedMesh) {
  const storms = manifest?.archive?.meshes?.[selectedMesh]?.storms || {};
  const years = new Set();

  Object.values(storms).forEach((storm) => {
    if (storm?.storm_year) years.add(String(storm.storm_year));
  });

  return Array.from(years).sort().reverse();
}

function getArchiveStorms(manifest, selectedMesh, selectedYear) {
  const storms = manifest?.archive?.meshes?.[selectedMesh]?.storms || {};

  return Object.entries(storms)
    .filter(([, value]) => String(value?.storm_year) === String(selectedYear))
    .map(([key, value]) => ({
      key,
      label: value?.label || key
    }));
}

function getStormAdvisories(manifest, mode, selectedMesh, stormKey) {
  if (!stormKey || !selectedMesh) return [];

  const advisories =
    manifest?.[mode]?.meshes?.[selectedMesh]?.storms?.[stormKey]?.advisories || {};

  return Object.keys(advisories).sort((a, b) => {
    const aNum = parseInt(String(a).replace(/\D+/g, ""), 10) || 0;
    const bNum = parseInt(String(b).replace(/\D+/g, ""), 10) || 0;
    return bNum - aNum;
  });
}

function getStormRunsByAdvisory(manifest, mode, selectedMesh, stormKey) {
  if (!stormKey || !selectedMesh) return {};

  const advisories =
    manifest?.[mode]?.meshes?.[selectedMesh]?.storms?.[stormKey]?.advisories || {};

  const result = {};

  for (const [advisoryKey, runsObj] of Object.entries(advisories)) {
    result[advisoryKey] = sortRuns(Object.keys(runsObj || {}));
  }

  return result;
}

function getModeDates(manifest, mode, selectedMesh, stormKey = "") {
  if (isStormMode(mode)) {
    return getStormAdvisories(manifest, mode, selectedMesh, stormKey);
  }

  const meshData = manifest?.daily?.meshes?.[selectedMesh];
  return Object.keys(meshData?.dates || {}).sort().reverse();
}

function getModeRunsByDate(manifest, mode, selectedMesh, stormKey = "") {
  if (isStormMode(mode)) {
    return getStormRunsByAdvisory(manifest, mode, selectedMesh, stormKey);
  }

  const meshData = manifest?.daily?.meshes?.[selectedMesh];
  const dates = meshData?.dates || {};
  const result = {};

  for (const [dateKey, runsObj] of Object.entries(dates)) {
    result[dateKey] = sortRuns(Object.keys(runsObj || {}));
  }

  return result;
}

function getAvailableLayers(
  manifest,
  mode,
  selectedMesh,
  selectedDate,
  selectedRun,
  selectedStorm = ""
) {
  if (isStormMode(mode)) {
    const runMeta =
      manifest?.[mode]?.meshes?.[selectedMesh]?.storms?.[selectedStorm]?.advisories?.[selectedDate]?.[selectedRun];
    const runLayers = runMeta?.layers;
    return Array.isArray(runLayers) && runLayers.length ? runLayers : ["maxele"];
  }

  const runMeta = manifest?.daily?.meshes?.[selectedMesh]?.dates?.[selectedDate]?.[selectedRun];
  const runLayers = runMeta?.layers;
  return Array.isArray(runLayers) && runLayers.length ? runLayers : ["maxele"];
}

function buildModeS3Url(
  manifest,
  mode,
  selectedMesh,
  selectedDate,
  selectedRun,
  primaryLayer,
  selectedStorm = ""
) {
  if (isStormMode(mode)) {
    const section = manifest?.[mode]?.meshes?.[selectedMesh];
    const stormMeta = section?.storms?.[selectedStorm];

    if (!selectedMesh || !section?.meteorology || !section?.model) return null;
    if (!stormMeta?.storm_year || !stormMeta?.storm_name) return null;
    if (!selectedStorm || !selectedDate || !selectedRun) return null;

    const filename = primaryLayer === "maxele" ? "maxele.tif" : "swan_HS_max.tif";
    const stormYear = String(stormMeta.storm_year);
    const stormName = String(stormMeta.storm_name).toLowerCase();

    return [
      S3_BASE_URL,
      mode,
      stormYear,
      stormName,
      selectedStorm,
      selectedMesh,
      section.meteorology,
      selectedDate,
      section.model,
      "forecast",
      selectedRun,
      filename
    ].join("/");
  }

  const section = manifest?.daily?.meshes?.[selectedMesh];
  if (!selectedMesh || !section?.meteorology || !section?.model) return null;
  if (!selectedDate || !selectedRun) return null;

  const { year, month, day } = splitDateParts(selectedDate);
  const filename = primaryLayer === "maxele" ? "maxele.tif" : "swan_HS_max.tif";

  return [
    S3_BASE_URL,
    "daily",
    selectedMesh,
    section.meteorology,
    year,
    month,
    day,
    selectedRun,
    section.model,
    "forecast",
    filename
  ].join("/");
}

function buildDailyForecastJsonUrl(manifest, selectedMesh, selectedDate, selectedRun) {
  const daily = manifest?.daily?.meshes?.[selectedMesh];
  if (!selectedMesh || !daily?.meteorology || !daily?.model) return null;
  if (!selectedDate || !selectedRun) return null;

  const { year, month, day } = splitDateParts(selectedDate);

  return [
    S3_BASE_URL,
    "daily",
    selectedMesh,
    daily.meteorology,
    year,
    month,
    day,
    selectedRun,
    daily.model,
    "forecast",
    "station_WSE.json"
  ].join("/");
}

function buildStormForecastJsonUrl(
  manifest,
  mode,
  selectedMesh,
  selectedStorm,
  selectedDate,
  selectedRun
) {
  const section = manifest?.[mode]?.meshes?.[selectedMesh];
  const stormMeta = section?.storms?.[selectedStorm];

  if (!selectedMesh || !section?.meteorology || !section?.model) return null;
  if (!stormMeta?.storm_year || !stormMeta?.storm_name) return null;
  if (!selectedStorm || !selectedDate || !selectedRun) return null;

  const stormYear = String(stormMeta.storm_year);
  const stormName = String(stormMeta.storm_name).toLowerCase();

  return [
    S3_BASE_URL,
    mode,
    stormYear,
    stormName,
    selectedStorm,
    selectedMesh,
    section.meteorology,
    selectedDate,
    section.model,
    "forecast",
    selectedRun,
    "station_WSE.json"
  ].join("/");
}

function getActiveLayerText(layerKey) {
  if (layerKey === "maxele") return "Maximum Water Level (ft NAVD88)";
  if (layerKey === "swan_HS_max") return "Maximum Significant Wave Height (ft)";
  return "Raster";
}

function parseCompactUtcTime(value) {
  if (value == null) return null;

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

function formatAdvisoryIssuedTime(value) {
  const date = parseCompactUtcTime(value);
  return date ? formatUtcDate(date) : "—";
}

function formatAdvisoryLabel(advisory) {
  if (!advisory) return "--";

  const number = String(advisory).match(/(\d+)$/)?.[1];
  return number ? `Advisory ${Number(number)}` : advisory;
}

function formatRunLabel(run) {
  if (!run) return "--";
  if (String(run).toLowerCase() === "ofcl") return "Official";
  if (/^\d+$/.test(String(run))) return `${run}Z`;
  return run;
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const modeParam = params.get("mode");
  const layerParam = params.get("layer");
  const basemapParam = params.get("basemap");
  const opacityRaw = params.get("opacity");
  const latRaw = params.get("lat");
  const lonRaw = params.get("lon");
  const zoomRaw = params.get("zoom");
  const opacityParam = opacityRaw == null ? Number.NaN : Number(opacityRaw);
  const lat = latRaw == null ? Number.NaN : Number(latRaw);
  const lon = lonRaw == null ? Number.NaN : Number(lonRaw);
  const zoom = zoomRaw == null ? Number.NaN : Number(zoomRaw);

  return {
    mode: VALID_MODES.has(modeParam) ? modeParam : MODES.DAILY,
    mesh: params.get("mesh") || "",
    hurricaneStorm: params.get("storm") || "",
    archiveStorm: params.get("storm") || "",
    year: params.get("year") || "",
    date: params.get("date") || "",
    run: params.get("run") || "",
    layer: VALID_LAYERS.has(layerParam) ? layerParam : "maxele",
    basemap: VALID_BASEMAPS.has(basemapParam) ? basemapParam : "aerial",
    opacity:
      Number.isFinite(opacityParam) && opacityParam >= 0 && opacityParam <= 100
        ? opacityParam
        : 80,
    stationsVisible: params.get("stations") !== "0",
    mapView:
      Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(zoom)
        ? { lat, lon, zoom }
        : null
  };
}

function isNarrowViewport() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function AccessibleModal({ title, titleId, onDismiss, className = "", children }) {
  const dialogRef = useRef(null);
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    dialog?.querySelector(focusableSelector)?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissRef.current?.();
        return;
      }

      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll(focusableSelector));
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div className="disclaimer-overlay">
      <div
        ref={dialogRef}
        className={`disclaimer-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const initialUrlState = useMemo(() => readUrlState(), []);
  // set the default mode to daily for now, but this could be changed to hurricane or archive if desired
  const [mode, setMode] = useState(initialUrlState.mode);
  //const [mode, setMode] = useState(MODES.HURRICANE);
  const [manifest, setManifest] = useState(null);
  const [manifestStatus, setManifestStatus] = useState("loading");
  const [primaryLayer, setPrimaryLayer] = useState(initialUrlState.layer);

  const [selectedMesh, setSelectedMesh] = useState(initialUrlState.mesh);
  const [selectedHurricaneStorm, setSelectedHurricaneStorm] = useState(
    initialUrlState.hurricaneStorm
  );
  const [selectedYear, setSelectedYear] = useState(initialUrlState.year);
  const [selectedArchiveStorm, setSelectedArchiveStorm] = useState(
    initialUrlState.archiveStorm
  );

  const [selectedDate, setSelectedDate] = useState(initialUrlState.date);
  const [selectedRun, setSelectedRun] = useState(initialUrlState.run);
  const [stationsVisible, setStationsVisible] = useState(
    initialUrlState.stationsVisible
  );
  const [pointHydrographEnabled, setPointHydrographEnabled] = useState(false);
  const [opacity, setOpacity] = useState(initialUrlState.opacity);
  const [selectedStation, setSelectedStation] = useState(null);
  const [selectedPointForecastUrl, setSelectedPointForecastUrl] = useState(null);
  const [panelHeight, setPanelHeight] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isNarrowViewport);
  const [basemap, setBasemap] = useState(initialUrlState.basemap);
  const [mapView, setMapView] = useState(initialUrlState.mapView);
  const [showHurricaneCone, setShowHurricaneCone] = useState(true);
  const [showHurricaneTrackPoints, setShowHurricaneTrackPoints] = useState(true);
  const [rasterStatus, setRasterStatus] = useState({
    state: "idle",
    message: "Waiting for raster."
  });
  const [pinnedValue, setPinnedValue] = useState({
    text: "Click map to pin location",
    latlng: null
  });
  const [pinCopyStatus, setPinCopyStatus] = useState("");
  const contentRef = useRef(null);

  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showNoHurricaneRuns, setShowNoHurricaneRuns] = useState(false);
  const [shareStatus, setShareStatus] = useState("");

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const handleChange = (event) => {
      if (event.matches) setSidebarCollapsed(true);
    };

    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const dismissed = localStorage.getItem("forecastDisclaimerAccepted");

    if (!dismissed) {
      setShowDisclaimer(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadManifest() {
      try {
        const response = await fetch(MANIFEST_URL);
        if (!response.ok) throw new Error(`Manifest not found at ${MANIFEST_URL}`);
        const data = await response.json();
        if (cancelled) return;
        setManifest(data);
        setManifestStatus("ready");
      } catch {
        if (cancelled) return;
        setManifestStatus("error");
      }
    }

    loadManifest();

    return () => {
      cancelled = true;
    };
  }, []);

  const availableMeshes = useMemo(() => getModeMeshes(manifest, mode), [manifest, mode]);

  useEffect(() => {
    if (!availableMeshes.length) return;

    const validKeys = availableMeshes.map((mesh) => mesh.key);

    if (!validKeys.includes(selectedMesh)) {
      setSelectedMesh(getDefaultMeshKey(manifest, mode));
      setSelectedDate("");
      setSelectedRun("");

      if (mode === MODES.HURRICANE) {
        setSelectedHurricaneStorm("");
      }

      if (mode === MODES.ARCHIVE) {
        setSelectedYear("");
        setSelectedArchiveStorm("");
      }
    }
  }, [manifest, mode, availableMeshes, selectedMesh]);

  const availableHurricaneStorms = useMemo(
    () => getHurricaneStorms(manifest, selectedMesh),
    [manifest, selectedMesh]
  );

  // Wait for the hurricane mesh to initialize before checking for active forecasts.
  useEffect(() => {
    if (mode !== MODES.HURRICANE) return;
    if (manifestStatus !== "ready") return;
    if (!selectedMesh) return;

    const noActiveRuns =
      availableMeshes.length === 0 ||
      availableHurricaneStorms.length === 0;

    setShowNoHurricaneRuns(noActiveRuns);
  }, [
    mode,
    manifestStatus,
    selectedMesh,
    availableMeshes,
    availableHurricaneStorms
  ]);

  const availableArchiveYears = useMemo(
    () => getArchiveYears(manifest, selectedMesh),
    [manifest, selectedMesh]
  );

  const availableArchiveStorms = useMemo(
    () => getArchiveStorms(manifest, selectedMesh, selectedYear),
    [manifest, selectedMesh, selectedYear]
  );

  useEffect(() => {
    if (mode !== MODES.HURRICANE) return;
    if (!availableHurricaneStorms.length) return;

    const validKeys = availableHurricaneStorms.map((storm) => storm.key);
    if (!validKeys.includes(selectedHurricaneStorm)) {
      setSelectedHurricaneStorm(validKeys[0]);
    }
  }, [mode, availableHurricaneStorms, selectedHurricaneStorm]);

  useEffect(() => {
    if (mode !== MODES.ARCHIVE) return;
    if (!availableArchiveYears.length) return;

    if (!availableArchiveYears.includes(selectedYear)) {
      setSelectedYear(availableArchiveYears[0]);
      setSelectedArchiveStorm("");
      setSelectedDate("");
      setSelectedRun("");
    }
  }, [mode, availableArchiveYears, selectedYear]);

  useEffect(() => {
    if (mode !== MODES.ARCHIVE) return;
    if (!availableArchiveStorms.length) return;

    const validKeys = availableArchiveStorms.map((storm) => storm.key);

    if (!validKeys.includes(selectedArchiveStorm)) {
      setSelectedArchiveStorm(validKeys[0]);
      setSelectedDate("");
      setSelectedRun("");
    }
  }, [mode, availableArchiveStorms, selectedArchiveStorm]);

  const activeStormKey =
    mode === MODES.ARCHIVE ? selectedArchiveStorm : selectedHurricaneStorm;

  const liveDates = useMemo(() => {
    return getModeDates(manifest, mode, selectedMesh, activeStormKey);
  }, [manifest, mode, selectedMesh, activeStormKey]);

  const runsByDate = useMemo(() => {
    return getModeRunsByDate(manifest, mode, selectedMesh, activeStormKey);
  }, [manifest, mode, selectedMesh, activeStormKey]);

  const latestDateOverall = liveDates.length ? liveDates[0] : "";
  const latestRunsOverall = latestDateOverall ? sortRuns(runsByDate[latestDateOverall] || []) : [];
  const latestRunOverall =
    isStormMode(mode)
      ? (
          latestRunsOverall.find((run) => String(run).toLowerCase() === "ofcl") ||
          (latestRunsOverall.length ? latestRunsOverall[latestRunsOverall.length - 1] : "")
        )
      : (latestRunsOverall.length ? latestRunsOverall[latestRunsOverall.length - 1] : "");

  const availableRuns = useMemo(
    () => sortRuns(runsByDate[selectedDate] || []),
    [runsByDate, selectedDate]
  );

  const availableLayers = useMemo(
    () => getAvailableLayers(manifest, mode, selectedMesh, selectedDate, selectedRun, activeStormKey),
    [manifest, mode, selectedMesh, selectedDate, selectedRun, activeStormKey]
  );

  const chosenLayer = availableLayers.includes(primaryLayer) ? primaryLayer : "maxele";
  const waveLayerAvailable = availableLayers.includes("swan_HS_max");

  useEffect(() => {
    if (manifestStatus !== "ready") return;
    if (!selectedMesh) return;
    if (mode === MODES.HURRICANE && !selectedHurricaneStorm) return;
    if (mode === MODES.ARCHIVE && !selectedArchiveStorm) return;
    if (!liveDates.length) return;

    const nextDate =
      selectedDate && liveDates.includes(selectedDate)
        ? selectedDate
        : liveDates[0];

    const runs = sortRuns(runsByDate[nextDate] || []);

    if (!runs.length) {
      setSelectedDate(nextDate);
      setSelectedRun("");
      return;
    }

    const defaultRun =
      isStormMode(mode)
        ? runs.find((run) => String(run).toLowerCase() === "ofcl") || runs[runs.length - 1]
        : runs[runs.length - 1];
    const nextRun = runs.includes(selectedRun) ? selectedRun : defaultRun;

    if (selectedDate !== nextDate) {
      setSelectedDate(nextDate);
    }

    if (selectedRun !== nextRun) {
      setSelectedRun(nextRun);
    }
  }, [
    manifestStatus,
    mode,
    selectedMesh,
    selectedHurricaneStorm,
    selectedArchiveStorm,
    liveDates,
    runsByDate,
    selectedDate,
    selectedRun
  ]);

  useEffect(() => {
    if (!availableLayers.includes(primaryLayer)) {
      setPrimaryLayer("maxele");
    }
  }, [availableLayers, primaryLayer]);

  const rasterUrl = useMemo(() => {
    return buildModeS3Url(
      manifest,
      mode,
      selectedMesh,
      selectedDate,
      selectedRun,
      chosenLayer,
      activeStormKey
    );
  }, [manifest, mode, selectedMesh, selectedDate, selectedRun, chosenLayer, activeStormKey]);

  const runMeta = useMemo(() => {
    if (mode === MODES.DAILY) {
      return manifest?.daily?.meshes?.[selectedMesh]?.dates?.[selectedDate]?.[selectedRun] || null;
    }

    if (isStormMode(mode)) {
      return (
        manifest?.[mode]?.meshes?.[selectedMesh]?.storms?.[activeStormKey]?.advisories?.[selectedDate]?.[selectedRun] ||
        null
      );
    }

    return null;
  }, [manifest, mode, selectedMesh, selectedDate, selectedRun, activeStormKey]);

  const hurricaneMeta = isStormMode(mode) ? runMeta?.hurricane || null : null;

  const runBaseUrl = useMemo(() => {
    if (!rasterUrl) return null;
    return rasterUrl.substring(0, rasterUrl.lastIndexOf("/"));
  }, [rasterUrl]);

  const pointHydrographAvailable = Boolean(runBaseUrl);

  useEffect(() => {
    if (!pointHydrographAvailable && pointHydrographEnabled) {
      setPointHydrographEnabled(false);
      setPinnedValue({ text: "Click map to pin location", latlng: null });
      setSelectedStation(null);
      setSelectedPointForecastUrl(null);
      setPinCopyStatus("");
    }
  }, [pointHydrographAvailable, pointHydrographEnabled]);

  const forecastCycleTime = runMeta?.cycleTime ?? null;
  const advisory = runMeta?.advisory ?? null;
  const advisoryTime = runMeta?.advisoryTime ?? null;
  const forecastType = runMeta?.forecastType ?? null;
  const runType = runMeta?.runType ?? null;

  const selectedMeshLabel =
    availableMeshes.find((mesh) => mesh.key === selectedMesh)?.label || selectedMesh;

  const selectedHurricaneStormLabel =
    availableHurricaneStorms.find((storm) => storm.key === selectedHurricaneStorm)?.label ||
    selectedHurricaneStorm;

  const selectedArchiveStormLabel =
    availableArchiveStorms.find((storm) => storm.key === selectedArchiveStorm)?.label ||
    selectedArchiveStorm;

  const activeStormLabel =
    mode === MODES.ARCHIVE ? selectedArchiveStormLabel : selectedHurricaneStormLabel;

  const hurricaneBannerText = useMemo(() => {
    if (!hurricaneMeta || !advisoryTime) return null;

    const issued = formatAdvisoryIssuedTime(advisoryTime);
    const stormName = activeStormLabel || "Storm";
    const advisoryText = advisory ? `Advisory ${advisory}` : null;

    return [stormName, advisoryText, `Issued: ${issued}`]
      .filter(Boolean)
      .join(" • ");
  }, [hurricaneMeta, advisoryTime, advisory, activeStormLabel]);

  useEffect(() => {
    if (!isResizing) return;

    function onMove(e) {
      if (!contentRef.current) return;
      const rect = contentRef.current.getBoundingClientRect();
      const minHeight = 220;
      const maxHeight = Math.max(320, Math.floor(rect.height * 0.75));
      const nextHeight = rect.bottom - e.clientY;
      setPanelHeight(Math.min(maxHeight, Math.max(minHeight, nextHeight)));
    }

    function onUp() {
      setIsResizing(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }

    document.body.style.userSelect = "none";
    document.body.style.cursor = "ns-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizing]);

  function resizePanelBy(delta) {
    setPanelHeight((currentHeight) => {
      const contentHeight = contentRef.current?.getBoundingClientRect().height || 640;
      const maxHeight = Math.max(320, Math.floor(contentHeight * 0.75));
      return Math.min(maxHeight, Math.max(220, currentHeight + delta));
    });
  }

  function resetInteractiveState() {
    setSelectedStation(null);
    setSelectedPointForecastUrl(null);
    setPinnedValue({ text: "Click map to pin location", latlng: null });
    setPinCopyStatus("");
  }

  function handleDisclaimerContinue() {
    if (dontShowAgain) {
      localStorage.setItem("forecastDisclaimerAccepted", "true");
    }

    setShowDisclaimer(false);
  }

  function handleDateChange(date) {
    const fallbackDate = liveDates.includes(date) ? date : liveDates[0];
    const nextRuns = sortRuns(runsByDate[fallbackDate] || []);
    const nextRun =
      isStormMode(mode)
        ? (
            nextRuns.find((run) => String(run).toLowerCase() === "ofcl") ||
            (nextRuns.length ? nextRuns[nextRuns.length - 1] : "")
          )
        : (nextRuns.length ? nextRuns[nextRuns.length - 1] : "");

    setSelectedDate(fallbackDate);
    setSelectedRun(nextRun);
    resetInteractiveState();
  }

  function handleArchiveYearChange(year) {
    setSelectedYear(year);
    setSelectedArchiveStorm("");
    setSelectedDate("");
    setSelectedRun("");
    resetInteractiveState();
  }

  function handleArchiveStormChange(stormKey) {
    setSelectedArchiveStorm(stormKey);
    setSelectedDate("");
    setSelectedRun("");
    resetInteractiveState();
  }

  function handleModeChange(nextMode) {
    const nextMesh = getDefaultMeshKey(manifest, nextMode);

    setMode(nextMode);
    setSelectedMesh(nextMesh);
    resetInteractiveState();
    setSelectedDate("");
    setSelectedRun("");
    setSelectedHurricaneStorm("");
    setSelectedArchiveStorm("");
    setSelectedYear("");
  }

  async function handleCopyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareStatus("Link copied");
    } catch {
      setShareStatus("Unable to copy link");
    }

    window.setTimeout(() => setShareStatus(""), 2500);
  }

  useEffect(() => {
    if (manifestStatus !== "ready" || !selectedMesh || !selectedDate || !selectedRun) {
      return;
    }

    const params = new URLSearchParams();
    params.set("mode", mode);
    params.set("mesh", selectedMesh);
    params.set("date", selectedDate);
    params.set("run", selectedRun);
    params.set("layer", chosenLayer);
    params.set("basemap", basemap);

    if (mode === MODES.HURRICANE && selectedHurricaneStorm) {
      params.set("storm", selectedHurricaneStorm);
    }

    if (mode === MODES.ARCHIVE) {
      if (selectedYear) params.set("year", selectedYear);
      if (selectedArchiveStorm) params.set("storm", selectedArchiveStorm);
    }

    if (opacity !== 80) params.set("opacity", String(opacity));
    if (!stationsVisible) params.set("stations", "0");

    if (mapView) {
      params.set("lat", mapView.lat.toFixed(5));
      params.set("lon", mapView.lon.toFixed(5));
      params.set("zoom", String(mapView.zoom));
    }

    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", nextUrl);
  }, [
    manifestStatus,
    mode,
    selectedMesh,
    selectedDate,
    selectedRun,
    selectedHurricaneStorm,
    selectedYear,
    selectedArchiveStorm,
    chosenLayer,
    basemap,
    opacity,
    stationsVisible,
    mapView
  ]);

  const statusText = useMemo(() => {
    const isLatest = selectedDate === latestDateOverall && selectedRun === latestRunOverall;

    if (mode === MODES.ARCHIVE) {
      return `Archive | ${selectedMeshLabel || "--"} | ${selectedYear || "--"} | ${selectedArchiveStormLabel || "--"} | ${formatAdvisoryLabel(selectedDate)} | ${formatRunLabel(selectedRun)}${isLatest ? " (Latest)" : ""}`;
    }

    if (mode === MODES.HURRICANE) {
      return `Hurricane | ${selectedMeshLabel || "--"} | ${selectedHurricaneStormLabel || "--"} | ${formatAdvisoryLabel(selectedDate)} | ${formatRunLabel(selectedRun)}${isLatest ? " (Latest)" : ""}`;
    }

    return `Daily | ${selectedMeshLabel || "--"} | ${selectedDate} | ${formatRunLabel(selectedRun)}${isLatest ? " (Latest)" : ""}`;
  }, [
    mode,
    selectedMeshLabel,
    selectedDate,
    selectedRun,
    latestDateOverall,
    latestRunOverall,
    selectedYear,
    selectedArchiveStormLabel,
    selectedHurricaneStormLabel
  ]);

  const activeLayerText = getActiveLayerText(chosenLayer);

  const forecastJsonUrl = useMemo(() => {
    if (!runMeta?.hasStationForecast) return null;

    if (mode === MODES.DAILY) {
      return buildDailyForecastJsonUrl(manifest, selectedMesh, selectedDate, selectedRun);
    }

    if (isStormMode(mode)) {
      return buildStormForecastJsonUrl(
        manifest,
        mode,
        selectedMesh,
        activeStormKey,
        selectedDate,
        selectedRun
      );
    }

    return null;
  }, [
    manifest,
    mode,
    selectedMesh,
    selectedDate,
    selectedRun,
    activeStormKey,
    runMeta
  ]);

  const selectedMeshInfo =
    availableMeshes.find((mesh) => mesh.key === selectedMesh) || null;

  const activeStations =
    STATIONS_BY_REGION[selectedMeshInfo?.region] ?? [];

  const analysisJsonUrl = useMemo(() => {
    if (!selectedStation || selectedStation?.isAdcircPoint) return null;
    return buildStationAnalysisUrl(runBaseUrl, selectedStation.id);
  }, [selectedStation, runBaseUrl]);

  return (
    <div className="app-page">
      <a className="skip-link" href="#forecast-main">
        Skip to forecast map
      </a>

      {showDisclaimer && (
        <AccessibleModal
          title="Experimental Research Product"
          titleId="disclaimer-title"
          onDismiss={() => setShowDisclaimer(false)}
        >
            <p>
              This website provides experimental coastal flood forecast information,
              model results, and related data products for research,
              evaluation, and demonstration purposes only. The website does not contain
              information related to rainfall-driven floods at this time.
            </p>

            <p>
              The information presented is under active development and may
              contain errors, omissions, inaccuracies, or interruptions in
              service.
            </p>

            <p>
              This website is not an operational forecasting system
              and should not be used for emergency management,
              public safety, evacuation planning, navigation, regulatory
              compliance, or any other decision-making purposes.
            </p>

            <p>
              Users should rely on official sources, including the National
              Weather Service, local emergency management agencies, and other
              authorized organizations for forecasts, warnings, and safety
              information.
            </p>

            <label className="disclaimer-checkbox">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
              />
              Don't show this message again on this device
            </label>

            <button
              className="disclaimer-button"
              onClick={handleDisclaimerContinue}
              type="button"
            >
              Continue
            </button>
        </AccessibleModal>
      )}

      {showNoHurricaneRuns && (
        <AccessibleModal
          title="No Active Hurricane Forecasts"
          titleId="no-hurricane-runs-title"
          onDismiss={() => setShowNoHurricaneRuns(false)}
        >
            <p>
              There are currently no active hurricane forecast runs available.
            </p>

            <p>
              Historical hurricane forecasts can be viewed using Archive mode.
            </p>

            <button
              className="disclaimer-button"
              onClick={() => setShowNoHurricaneRuns(false)}
              type="button"
            >
              Close
            </button>
        </AccessibleModal>
      )}

      {showContact && (
        <AccessibleModal
          title="Contact"
          titleId="contact-title"
          onDismiss={() => setShowContact(false)}
          className="contact-modal"
        >
            <p>
              Questions, feedback, bug reports, or collaboration inquiries:
            </p>
            <p>
              <strong>Matthew V. Bilskie</strong><br />
              University of Georgia<br />
              College of Engineering
            </p>
            <p>
              <a href="mailto:mbilskie@uga.edu">
                mbilskie@uga.edu
              </a>
            </p>
            <button
              className="disclaimer-button"
              onClick={() => setShowContact(false)}
              type="button"
            >
              Close
            </button>
        </AccessibleModal>
      )}

      <Header />

      <div className="app-shell">
        <Sidebar
          collapsed={sidebarCollapsed}
          onCollapseToggle={() => setSidebarCollapsed((v) => !v)}
          mode={mode}
          primaryLayer={chosenLayer}
          onPrimaryLayerChange={setPrimaryLayer}
          waveLayerAvailable={waveLayerAvailable}
          selectedDate={selectedDate}
          liveDates={liveDates}
          runsByDate={runsByDate}
          onDateChange={handleDateChange}
          latestDateOverall={latestDateOverall}
          latestRunOverall={latestRunOverall}
          availableRuns={availableRuns}
          selectedRun={selectedRun}
          onRunChange={(run) => {
            setSelectedRun(run);
            resetInteractiveState();
          }}
          stationsVisible={stationsVisible}
          onStationsVisibleChange={setStationsVisible}
          pointHydrographEnabled={pointHydrographEnabled}
          pointHydrographAvailable={pointHydrographAvailable}
          onPointHydrographEnabledChange={(enabled) => {
            setPointHydrographEnabled(enabled);
            setPinnedValue({ text: "Click map to pin location", latlng: null });
            setSelectedStation(null);
            setSelectedPointForecastUrl(null);
            setPinCopyStatus("");
          }}
          opacity={opacity}
          onOpacityChange={setOpacity}
          basemap={basemap}
          onBasemapChange={setBasemap}
          showHurricaneCone={showHurricaneCone}
          onShowHurricaneConeChange={setShowHurricaneCone}
          showHurricaneTrackPoints={showHurricaneTrackPoints}
          onShowHurricaneTrackPointsChange={setShowHurricaneTrackPoints}
          archiveYears={availableArchiveYears}
          selectedYear={selectedYear}
          onYearChange={handleArchiveYearChange}
          availableStorms={availableArchiveStorms}
          selectedStorm={selectedArchiveStorm}
          onStormChange={handleArchiveStormChange}
          availableAdvisories={liveDates}
          selectedAdvisory={selectedDate}
          onAdvisoryChange={handleDateChange}
          availableHurricaneStorms={availableHurricaneStorms}
          selectedHurricaneStorm={selectedHurricaneStorm}
          onHurricaneStormChange={(stormKey) => {
            setSelectedHurricaneStorm(stormKey);
            setSelectedDate("");
            setSelectedRun("");
            resetInteractiveState();
          }}
          availableMeshes={availableMeshes}
          selectedMesh={selectedMesh}
          onMeshChange={(meshKey) => {
            setSelectedMesh(meshKey);
            setSelectedDate("");
            setSelectedRun("");

            if (mode === MODES.HURRICANE) {
              setSelectedHurricaneStorm("");
            }

            if (mode === MODES.ARCHIVE) {
              setSelectedYear("");
              setSelectedArchiveStorm("");
            }

            resetInteractiveState();
          }}
          layerConfig={LAYER_CONFIGS[chosenLayer]}
        />

        <main className="main-panel" id="forecast-main" tabIndex={-1}>
          <TopBar
            mode={mode}
            onModeChange={handleModeChange}
            statusText={statusText}
            activeLayerText={activeLayerText}
            onShare={handleCopyShareLink}
            shareStatus={shareStatus}
          />

          {mode === MODES.HURRICANE && hurricaneBannerText && (
            <div className="banner banner-hurricane" role="status">
              {hurricaneBannerText}
            </div>
          )}

          {mode === MODES.ARCHIVE && (
            <div className="banner banner-archive" role="status">
              Archived Forecast — Not Current Conditions
              {hurricaneBannerText ? ` • ${hurricaneBannerText}` : ""}
            </div>
          )}

          <div className="content-area" ref={contentRef}>
            <LeafletMap
              selectedMesh={selectedMesh}
              stations={activeStations}
              stationsVisible={stationsVisible}
              opacity={opacity}
              onStationSelect={setSelectedStation}
              rasterUrl={rasterUrl}
              onRasterStatusChange={setRasterStatus}
              basemap={basemap}
              pinnedValue={pinnedValue}
              pointHydrographEnabled={pointHydrographEnabled}
              onPinValueChange={(value) => {
                setPinnedValue(value);

                if (!value?.latlng) {
                  setPinCopyStatus("");
                  return;
                }

                if (!pointHydrographEnabled || !pointHydrographAvailable) {
                  return;
                }

                const forecastUrl = buildClickedPointForecastUrl(
                  runBaseUrl,
                  value.latlng
                );

                setSelectedPointForecastUrl(forecastUrl);

                setSelectedStation({
                  id: "clicked-point",
                  name: "Selected Map Point",
                  lat: value.latlng.lat,
                  lon: value.latlng.lng,
                  isAdcircPoint: true
                });
              }}
              pinCopyStatus={pinCopyStatus}
              onPinCopyStatusChange={setPinCopyStatus}
              selectedDate={selectedDate}
              selectedRun={selectedRun}
              layerConfig={LAYER_CONFIGS[chosenLayer]}
              hurricaneMeta={hurricaneMeta}
              runBaseUrl={runBaseUrl}
              showHurricaneCone={showHurricaneCone}
              showHurricaneTrackPoints={showHurricaneTrackPoints}
              initialMapView={initialUrlState.mapView}
              onMapViewChange={setMapView}
            />

            <div className="sr-only" role="status" aria-live="polite">
              {rasterStatus.message}
            </div>

            <div
              className={"station-panel " + (selectedStation ? "open" : "")}
              style={selectedStation ? { height: panelHeight + "px" } : undefined}
              role={selectedStation ? "region" : undefined}
              aria-label={selectedStation ? `${selectedStation.name} details` : undefined}
            >
              {selectedStation ? (
                <StationPanel
                  station={selectedStation}
                  forecastJsonUrl={
                    selectedStation?.isAdcircPoint
                      ? selectedPointForecastUrl
                      : forecastJsonUrl
                  }
                  analysisJsonUrl={analysisJsonUrl}
                  forecastCycleTime={forecastCycleTime}
                  runMeta={runMeta}
                  onClose={() => {
                    setSelectedStation(null);
                    setSelectedPointForecastUrl(null);
                  }}
                  onResizeStart={() => setIsResizing(true)}
                  onResizeBy={resizePanelBy}
                />
              ) : null}
            </div>
          </div>
        </main>
      </div>

      {!selectedStation && (
        <div className="floating-button-stack">
          <button
            className="floating-action-button"
            onClick={() => setShowDisclaimer(true)}
            type="button"
          >
            Disclaimer
          </button>

          <button
            className="floating-action-button"
            onClick={() => setShowContact(true)}
            type="button"
          >
            Contact
          </button>
        </div>
      )}
    </div>
  );
}
