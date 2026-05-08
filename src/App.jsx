import React, { useEffect, useMemo, useRef, useState } from "react";
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import TopBar from "./components/TopBar.jsx";
import LeafletMap from "./components/LeafletMap.jsx";
import StationPanel from "./components/StationPanel.jsx";
import {
  stations,
  archiveYears,
  archiveStormsByYear,
  archiveAdvisoriesByStorm
} from "./data/mockData.js";
import { LAYER_CONFIGS } from "./config/layers.js";

const S3_BASE_URL = "https://uga-coast-forecasting.s3.us-east-1.amazonaws.com";
const MANIFEST_URL = `${S3_BASE_URL}/raster-manifest.json`;
const MODES = { DAILY: "daily", HURRICANE: "hurricane", ARCHIVE: "archive" };

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

function getModeMeshes(manifest, mode) {
  if (mode === MODES.ARCHIVE) return [];

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

function getSelectedMeshData(manifest, mode, selectedMesh) {
  if (mode === MODES.ARCHIVE) return null;
  return manifest?.[mode]?.meshes?.[selectedMesh] || null;
}

function getHurricaneStorms(manifest, selectedMesh) {
  const storms = manifest?.hurricane?.meshes?.[selectedMesh]?.storms || {};
  return Object.entries(storms).map(([key, value]) => ({
    key,
    label: value?.label || key
  }));
}

function getHurricaneAdvisories(manifest, selectedMesh, stormKey) {
  if (!stormKey || !selectedMesh) return [];
  const advisories =
    manifest?.hurricane?.meshes?.[selectedMesh]?.storms?.[stormKey]?.advisories || {};

  return Object.keys(advisories).sort((a, b) => {
    const aNum = parseInt(String(a).replace(/\D+/g, ""), 10) || 0;
    const bNum = parseInt(String(b).replace(/\D+/g, ""), 10) || 0;
    return bNum - aNum;
  });
}

function getHurricaneRunsByAdvisory(manifest, selectedMesh, stormKey) {
  if (!stormKey || !selectedMesh) return {};
  const advisories =
    manifest?.hurricane?.meshes?.[selectedMesh]?.storms?.[stormKey]?.advisories || {};
  const result = {};

  for (const [advisoryKey, runsObj] of Object.entries(advisories)) {
    result[advisoryKey] = sortRuns(Object.keys(runsObj || {}));
  }

  return result;
}

function getModeDates(manifest, mode, selectedMesh, stormKey = "") {
  if (mode === MODES.HURRICANE) {
    return getHurricaneAdvisories(manifest, selectedMesh, stormKey);
  }

  const meshData = manifest?.daily?.meshes?.[selectedMesh];
  return Object.keys(meshData?.dates || {}).sort().reverse();
}

function getModeRunsByDate(manifest, mode, selectedMesh, stormKey = "") {
  if (mode === MODES.HURRICANE) {
    return getHurricaneRunsByAdvisory(manifest, selectedMesh, stormKey);
  }

  const meshData = manifest?.daily?.meshes?.[selectedMesh];
  const dates = meshData?.dates || {};
  const result = {};

  for (const [dateKey, runsObj] of Object.entries(dates)) {
    result[dateKey] = sortRuns(Object.keys(runsObj || {}));
  }

  return result;
}

function getAvailableLayers(manifest, mode, selectedMesh, selectedDate, selectedRun, selectedStorm = "") {
  if (mode === MODES.ARCHIVE) {
    return ["maxele"];
  }

  if (mode === MODES.HURRICANE) {
    const runMeta =
      manifest?.hurricane?.meshes?.[selectedMesh]?.storms?.[selectedStorm]?.advisories?.[selectedDate]?.[selectedRun];
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
  if (mode === MODES.HURRICANE) {
    const section = manifest?.hurricane?.meshes?.[selectedMesh];
    const stormMeta = section?.storms?.[selectedStorm];

    if (!selectedMesh || !section?.meteorology || !section?.model) return null;
    if (!stormMeta?.storm_year || !stormMeta?.storm_name) return null;
    if (!selectedStorm || !selectedDate || !selectedRun) return null;

    const filename = primaryLayer === "maxele" ? "maxele.tif" : "swan_HS_max.tif";
    const stormYear = String(stormMeta.storm_year);
    const stormName = String(stormMeta.storm_name).toLowerCase();

    return [
      S3_BASE_URL,
      "hurricane",
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
    "station_WSE_forecast.json"
  ].join("/");
}

function buildHurricaneForecastJsonUrl(
  manifest,
  selectedMesh,
  selectedStorm,
  selectedDate,
  selectedRun
) {
  const section = manifest?.hurricane?.meshes?.[selectedMesh];
  const stormMeta = section?.storms?.[selectedStorm];

  if (!selectedMesh || !section?.meteorology || !section?.model) return null;
  if (!stormMeta?.storm_year || !stormMeta?.storm_name) return null;
  if (!selectedStorm || !selectedDate || !selectedRun) return null;

  const stormYear = String(stormMeta.storm_year);
  const stormName = String(stormMeta.storm_name).toLowerCase();

  return [
    S3_BASE_URL,
    "hurricane",
    stormYear,
    stormName,
    selectedStorm,
    selectedMesh,
    section.meteorology,
    selectedDate,
    section.model,
    "forecast",
    selectedRun,
    "station_WSE_forecast.json"
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
  const [mode, setMode] = useState(MODES.DAILY);
  const [manifest, setManifest] = useState(null);
  const [manifestStatus, setManifestStatus] = useState("loading");
  const [primaryLayer, setPrimaryLayer] = useState("maxele");
  const [hasInitializedFromManifest, setHasInitializedFromManifest] = useState(false);

  const [selectedMesh, setSelectedMesh] = useState("");
  const [selectedHurricaneStorm, setSelectedHurricaneStorm] = useState("");

  const [selectedDate, setSelectedDate] = useState("");
  const [selectedRun, setSelectedRun] = useState("");
  const [stationsVisible, setStationsVisible] = useState(true);
  const [opacity, setOpacity] = useState(80);
  const [selectedStation, setSelectedStation] = useState(null);
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

  const [selectedYear, setSelectedYear] = useState(archiveYears[0]);
  const [selectedStorm, setSelectedStorm] = useState(archiveStormsByYear[archiveYears[0]][0]);
  const [selectedAdvisory, setSelectedAdvisory] = useState(
    archiveAdvisoriesByStorm[archiveStormsByYear[archiveYears[0]][0]][0]
  );

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
  const selectedMeshData = useMemo(
    () => getSelectedMeshData(manifest, mode, selectedMesh),
    [manifest, mode, selectedMesh]
  );

  useEffect(() => {
    if (mode === MODES.ARCHIVE) return;
    if (!availableMeshes.length) return;

    const validKeys = availableMeshes.map((mesh) => mesh.key);

    if (!validKeys.includes(selectedMesh)) {
      setSelectedMesh(getDefaultMeshKey(manifest, mode));
      setSelectedDate("");
      setSelectedRun("");

      if (mode === MODES.HURRICANE) {
        setSelectedHurricaneStorm("");
      }
    }
  }, [manifest, mode, availableMeshes, selectedMesh]);

  const availableHurricaneStorms = useMemo(
    () => getHurricaneStorms(manifest, selectedMesh),
    [manifest, selectedMesh]
  );

  useEffect(() => {
    if (mode !== MODES.HURRICANE) return;
    if (!availableHurricaneStorms.length) return;

    const validKeys = availableHurricaneStorms.map((storm) => storm.key);
    if (!validKeys.includes(selectedHurricaneStorm)) {
      setSelectedHurricaneStorm(validKeys[0]);
    }
  }, [mode, availableHurricaneStorms, selectedHurricaneStorm]);

  const liveDates = useMemo(() => {
    if (mode === MODES.ARCHIVE) return [];
    return getModeDates(manifest, mode, selectedMesh, selectedHurricaneStorm);
  }, [manifest, mode, selectedMesh, selectedHurricaneStorm]);

  const runsByDate = useMemo(() => {
    if (mode === MODES.ARCHIVE) return {};
    return getModeRunsByDate(manifest, mode, selectedMesh, selectedHurricaneStorm);
  }, [manifest, mode, selectedMesh, selectedHurricaneStorm]);

  const latestDateOverall = liveDates.length ? liveDates[0] : "";
  const latestRunsOverall = latestDateOverall ? sortRuns(runsByDate[latestDateOverall] || []) : [];
  const latestRunOverall =
    mode === MODES.HURRICANE
      ? (
          latestRunsOverall.find((run) => String(run).toLowerCase() === "ofcl") ||
          (latestRunsOverall.length ? latestRunsOverall[latestRunsOverall.length - 1] : "")
        )
      : (latestRunsOverall.length ? latestRunsOverall[latestRunsOverall.length - 1] : "");

  useEffect(() => {
    if (hasInitializedFromManifest) return;
    if (manifestStatus !== "ready") return;
    if (mode !== MODES.ARCHIVE && !selectedMesh) return;
    if (mode === MODES.HURRICANE && !selectedHurricaneStorm) return;
    if (!liveDates.length) return;

    setSelectedDate(latestDateOverall);
    setSelectedRun(latestRunOverall);
    setHasInitializedFromManifest(true);
  }, [
    hasInitializedFromManifest,
    manifestStatus,
    mode,
    selectedMesh,
    selectedHurricaneStorm,
    liveDates,
    latestDateOverall,
    latestRunOverall
  ]);

  const availableRuns = useMemo(
    () => sortRuns(runsByDate[selectedDate] || []),
    [runsByDate, selectedDate]
  );

  const availableStorms = useMemo(() => archiveStormsByYear[selectedYear] || [], [selectedYear]);
  const availableAdvisories = useMemo(
    () => archiveAdvisoriesByStorm[selectedStorm] || [],
    [selectedStorm]
  );

  const availableLayers = useMemo(
    () => getAvailableLayers(manifest, mode, selectedMesh, selectedDate, selectedRun, selectedHurricaneStorm),
    [manifest, mode, selectedMesh, selectedDate, selectedRun, selectedHurricaneStorm]
  );

  const chosenLayer = availableLayers.includes(primaryLayer) ? primaryLayer : "maxele";
  const waveLayerAvailable = availableLayers.includes("swan_HS_max");

  useEffect(() => {
    if (!liveDates.length) return;
    if (!liveDates.includes(selectedDate)) {
      setSelectedDate(liveDates[0]);
    }
  }, [liveDates, selectedDate]);

  useEffect(() => {
    if (!availableRuns.length) return;
    if (!availableRuns.includes(selectedRun)) {
      const preferredRun =
        mode === MODES.HURRICANE
          ? (
              availableRuns.find((run) => String(run).toLowerCase() === "ofcl") ||
              availableRuns[availableRuns.length - 1]
            )
          : availableRuns[availableRuns.length - 1];

      setSelectedRun(preferredRun);
    }
  }, [availableRuns, selectedRun, mode]);

  useEffect(() => {
    if (!availableLayers.includes(primaryLayer)) {
      setPrimaryLayer("maxele");
    }
  }, [availableLayers, primaryLayer]);

  const rasterUrl = useMemo(() => {
    if (mode === MODES.ARCHIVE) {
      return null;
    }

    return buildModeS3Url(
      manifest,
      mode,
      selectedMesh,
      selectedDate,
      selectedRun,
      chosenLayer,
      selectedHurricaneStorm
    );
  }, [manifest, mode, selectedMesh, selectedDate, selectedRun, chosenLayer, selectedHurricaneStorm]);

  const runMeta = useMemo(() => {
    if (mode === MODES.DAILY) {
      return manifest?.daily?.meshes?.[selectedMesh]?.dates?.[selectedDate]?.[selectedRun] || null;
    }

    if (mode === MODES.HURRICANE) {
      return (
        manifest?.hurricane?.meshes?.[selectedMesh]?.storms?.[selectedHurricaneStorm]?.advisories?.[selectedDate]?.[selectedRun] ||
        null
      );
    }

    return null;
  }, [manifest, mode, selectedMesh, selectedDate, selectedRun, selectedHurricaneStorm]);

  const hurricaneMeta = mode === MODES.HURRICANE ? runMeta?.hurricane || null : null;

  const runBaseUrl = useMemo(() => {
    if (!rasterUrl) return null;
    return rasterUrl.substring(0, rasterUrl.lastIndexOf("/"));
  }, [rasterUrl]);

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

  const hurricaneBannerText = useMemo(() => {
    if (!hurricaneMeta || !advisoryTime) return null;

    const issued = formatAdvisoryIssuedTime(advisoryTime);
    const stormName = selectedHurricaneStormLabel || "Storm";
    const advisoryText = advisory ? `Advisory ${advisory}` : null;

    return [stormName, advisoryText, `Issued: ${issued}`]
      .filter(Boolean)
      .join(" • ");
  }, [hurricaneMeta, advisoryTime, advisory, selectedHurricaneStormLabel]);

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
    setPinnedValue({ text: "Click map to pin location", latlng: null });
    setPinCopyStatus("");
  }

  function handleDateChange(date) {
    const fallbackDate = liveDates.includes(date) ? date : liveDates[0];
    const nextRuns = sortRuns(runsByDate[fallbackDate] || []);
    const nextRun =
      mode === MODES.HURRICANE
        ? (
            nextRuns.find((run) => String(run).toLowerCase() === "ofcl") ||
            (nextRuns.length ? nextRuns[nextRuns.length - 1] : "")
          )
        : (nextRuns.length ? nextRuns[nextRuns.length - 1] : "");

    setSelectedDate(fallbackDate);
    setSelectedRun(nextRun);
    resetInteractiveState();
  }

  function handleYearChange(year) {
    const storms = archiveStormsByYear[year] || [];
    const nextStorm = storms[0] || "";
    const advisories = archiveAdvisoriesByStorm[nextStorm] || [];
    const nextAdvisory = advisories[0] || "";

    setSelectedYear(year);
    setSelectedStorm(nextStorm);
    setSelectedAdvisory(nextAdvisory);
    setSelectedStation(null);
  }

  function handleStormChange(storm) {
    const advisories = archiveAdvisoriesByStorm[storm] || [];
    const nextAdvisory = advisories[0] || "";

    setSelectedStorm(storm);
    setSelectedAdvisory(nextAdvisory);
    setSelectedStation(null);
  }

  function handleModeChange(nextMode) {
    const nextMesh =
      nextMode === MODES.ARCHIVE ? "" : getDefaultMeshKey(manifest, nextMode);

    setMode(nextMode);
    setSelectedMesh(nextMesh);
    setSelectedStation(null);
    setPinnedValue({ text: "Click map to pin location", latlng: null });
    setPinCopyStatus("");
    setSelectedDate("");
    setSelectedRun("");
    setSelectedHurricaneStorm("");
    setHasInitializedFromManifest(false);
  }

  const statusText = useMemo(() => {
    if (mode === MODES.ARCHIVE) {
      return `Archive | ${selectedYear} | ${selectedStorm} | ${selectedAdvisory}`;
    }

    if (mode === MODES.HURRICANE) {
      const isLatest = selectedDate === latestDateOverall && selectedRun === latestRunOverall;
      return `Hurricane | ${selectedMeshLabel || "--"} | ${selectedHurricaneStormLabel || "--"} | ${selectedDate} | ${selectedRun}${isLatest ? " (Latest)" : ""}`;
    }

    const isLatest = selectedDate === latestDateOverall && selectedRun === latestRunOverall;
    return `Daily | ${selectedMeshLabel || "--"} | ${selectedDate} | ${selectedRun}${isLatest ? " (Latest)" : ""}`;
  }, [
    mode,
    selectedMeshLabel,
    selectedDate,
    selectedRun,
    latestDateOverall,
    latestRunOverall,
    selectedYear,
    selectedStorm,
    selectedAdvisory,
    selectedHurricaneStormLabel
  ]);

  const activeLayerText = getActiveLayerText(chosenLayer);

  const forecastJsonUrl = useMemo(() => {
    if (!runMeta?.hasStationForecast) return null;

    if (mode === MODES.DAILY) {
      return buildDailyForecastJsonUrl(manifest, selectedMesh, selectedDate, selectedRun);
    }

    if (mode === MODES.HURRICANE) {
      return buildHurricaneForecastJsonUrl(
        manifest,
        selectedMesh,
        selectedHurricaneStorm,
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
    selectedHurricaneStorm,
    runMeta
  ]);

  return (
    <div className="app-page">
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
          opacity={opacity}
          onOpacityChange={setOpacity}
          basemap={basemap}
          onBasemapChange={setBasemap}
          showHurricaneCone={showHurricaneCone}
          onShowHurricaneConeChange={setShowHurricaneCone}
          showHurricaneTrackPoints={showHurricaneTrackPoints}
          onShowHurricaneTrackPointsChange={setShowHurricaneTrackPoints}
          archiveYears={archiveYears}
          selectedYear={selectedYear}
          onYearChange={handleYearChange}
          availableStorms={availableStorms}
          selectedStorm={selectedStorm}
          onStormChange={handleStormChange}
          availableAdvisories={availableAdvisories}
          selectedAdvisory={selectedAdvisory}
          onAdvisoryChange={setSelectedAdvisory}
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
            setSelectedHurricaneStorm("");
            setSelectedDate("");
            setSelectedRun("");
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
            <div className="banner banner-archive">Archived Forecast — Not Current Conditions</div>
          )}

          <div className="content-area" ref={contentRef}>
            <LeafletMap
              stations={stations}
              stationsVisible={stationsVisible}
              opacity={opacity}
              onStationSelect={setSelectedStation}
              rasterUrl={rasterUrl}
              rasterStatus={rasterStatus}
              onRasterStatusChange={setRasterStatus}
              basemap={basemap}
              pinnedValue={pinnedValue}
              onPinValueChange={(value) => {
                setPinnedValue(value);
                if (!value?.latlng) setPinCopyStatus("");
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
                  forecastJsonUrl={forecastJsonUrl}
                  forecastCycleTime={forecastCycleTime}
                  runMeta={runMeta}
                  onClose={() => setSelectedStation(null)}
                  onResizeStart={() => setIsResizing(true)}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}