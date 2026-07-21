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
  return Object.entries(storms).map(([key, value]) => ({
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

export default function App() {
  // set the default mode to daily for now, but this could be changed to hurricane or archive if desired
  const [mode, setMode] = useState(MODES.HURRICANE);
  const [manifest, setManifest] = useState(null);
  const [manifestStatus, setManifestStatus] = useState("loading");
  const [primaryLayer, setPrimaryLayer] = useState("maxele");

  const [selectedMesh, setSelectedMesh] = useState("");
  const [selectedHurricaneStorm, setSelectedHurricaneStorm] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedArchiveStorm, setSelectedArchiveStorm] = useState("");

  const [selectedDate, setSelectedDate] = useState("");
  const [selectedRun, setSelectedRun] = useState("");
  const [stationsVisible, setStationsVisible] = useState(true);
  const [pointHydrographEnabled, setPointHydrographEnabled] = useState(false);
  const [opacity, setOpacity] = useState(80);
  const [selectedStation, setSelectedStation] = useState(null);
  const [selectedPointForecastUrl, setSelectedPointForecastUrl] = useState(null);
  const [panelHeight, setPanelHeight] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [basemap, setBasemap] = useState("aerial");
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

    const nextRun =
      isStormMode(mode)
        ? runs.find((run) => String(run).toLowerCase() === "ofcl") || runs[runs.length - 1]
        : runs[runs.length - 1];

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

  const statusText = useMemo(() => {
    const isLatest = selectedDate === latestDateOverall && selectedRun === latestRunOverall;

    if (mode === MODES.ARCHIVE) {
      return `Archive | ${selectedMeshLabel || "--"} | ${selectedYear || "--"} | ${selectedArchiveStormLabel || "--"} | ${selectedDate || "--"} | ${selectedRun || "--"}${isLatest ? " (Latest)" : ""}`;
    }

    if (mode === MODES.HURRICANE) {
      return `Hurricane | ${selectedMeshLabel || "--"} | ${selectedHurricaneStormLabel || "--"} | ${selectedDate} | ${selectedRun}${isLatest ? " (Latest)" : ""}`;
    }

    return `Daily | ${selectedMeshLabel || "--"} | ${selectedDate} | ${selectedRun}${isLatest ? " (Latest)" : ""}`;
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

  console.log({
    mode,
    selectedMesh,
    selectedYear,
    selectedArchiveStorm,
    selectedDate,
    selectedRun,
    rasterUrl,
    liveDates,
    availableRuns
  });

  return (
    <div className="app-page">
      {showDisclaimer && (
        <div className="disclaimer-overlay">
          <div className="disclaimer-modal">
            <h2>Experimental Research Product</h2>

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
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {showNoHurricaneRuns && (
        <div className="disclaimer-overlay">
          <div className="disclaimer-modal">
            <h2>No Active Hurricane Forecasts</h2>

            <p>
              There are currently no active hurricane forecast runs available.
            </p>

            <p>
              Historical hurricane forecasts can be viewed using Archive mode.
            </p>

            <button
              className="disclaimer-button"
              onClick={() => setShowNoHurricaneRuns(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showContact && (
        <div className="disclaimer-overlay">
          <div className="disclaimer-modal contact-modal">
            <h2>Contact</h2>
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
            >
              Close
            </button>
          </div>
        </div>
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

        <div className="main-panel">
          <TopBar
            mode={mode}
            onModeChange={handleModeChange}
            statusText={statusText}
            activeLayerText={activeLayerText}
          />

          {mode === MODES.HURRICANE && hurricaneBannerText && (
            <div className="banner banner-hurricane">
              {hurricaneBannerText}
            </div>
          )}

          {mode === MODES.ARCHIVE && (
            <div className="banner banner-archive">
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
              rasterStatus={rasterStatus}
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
            />

            <div
              className={"station-panel " + (selectedStation ? "open" : "")}
              style={selectedStation ? { height: panelHeight + "px" } : undefined}
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
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {!selectedStation && (
        <div className="floating-button-stack">
          <button
            className="floating-action-button"
            onClick={() => setShowDisclaimer(true)}
          >
            Disclaimer
          </button>

          <button
            className="floating-action-button"
            onClick={() => setShowContact(true)}
          >
            Contact
          </button>
        </div>
      )}
    </div>
  );
}
