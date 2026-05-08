import React from "react";

function formatRunLabel(run) {
  if (!run) return "--";

  const str = String(run).toLowerCase();

  if (str === "ofcl") return "Official";
  if (str === "best") return "Best Track";

  if (/^\d+$/.test(str)) {
    return `${str}Z`;
  }

  return run;
}

function formatMiniDate(mode, selectedDate) {
  if (!selectedDate) return "--";
  if (mode === "hurricane") return selectedDate;
  return selectedDate.replace("2026-", "");
}

function SidebarSection({ title, children }) {
  return (
    <div className="sidebar-section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function RunPills({
  runs,
  selectedRun,
  onRunChange,
  latestRun,
  selectedDate,
  latestDateOverall
}) {
  if (!runs.length) {
    return <div className="empty-runs">No runs available for this selection</div>;
  }

  const effectiveLatestRun =
    runs.find((run) => String(run).toLowerCase() === "ofcl") || latestRun;

  return (
    <div className="run-pill-group">
      {runs.map((run) => {
        const isLatest =
          selectedDate === latestDateOverall && run === effectiveLatestRun;

        return (
          <button
            key={run}
            type="button"
            className={
              "run-pill " +
              (selectedRun === run ? "active " : "") +
              (String(run).toLowerCase() === "ofcl" ? "run-pill-ofcl" : "")
            }
            onClick={() => onRunChange(run)}
          >
            <span>{formatRunLabel(run)}</span>
            {isLatest ? <span className="run-pill-tag">Latest</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function MiniSidebar({
  mode,
  selectedDate,
  selectedRun,
  stationsVisible,
  onStationsVisibleChange,
  basemap,
  primaryLayer,
  onExpand,
  selectedMesh,
  availableMeshes,
  selectedHurricaneStorm,
  availableHurricaneStorms,
  //showHurricaneCone,
  showHurricaneTrackPoints
}) {
  const meshLabel =
    availableMeshes?.find((mesh) => mesh.key === selectedMesh)?.label ||
    selectedMesh ||
    "--";

  const hurricaneStormLabel =
    availableHurricaneStorms?.find((storm) => storm.key === selectedHurricaneStorm)?.label ||
    selectedHurricaneStorm ||
    "--";

  return (
    <aside className="sidebar mini-sidebar">
      <button
        className="sidebar-toggle"
        type="button"
        onClick={onExpand}
        title="Expand controls"
      >
        ⟩
      </button>

      <div className="mini-block">
        <div className="mini-label">Mode</div>
        <div className={"mini-mode-badge " + mode}>{mode}</div>
      </div>

      {mode !== "archive" ? (
        <div className="mini-block">
          <div className="mini-label">Region</div>
          <div className="mini-value">{meshLabel}</div>
        </div>
      ) : null}

      {mode === "hurricane" ? (
        <>
          <div className="mini-block">
            <div className="mini-label">Storm</div>
            <div className="mini-value">{hurricaneStormLabel}</div>
          </div>

          {/* Cone data is currently unreliable so hiding this for now until we can confirm data and update styling as needed *\/}
          <div className="mini-block">
            <div className="mini-label">Cone</div>
            <div className="mini-value">{showHurricaneCone ? "On" : "Off"}</div>
          </div>
          */}

          <div className="mini-block">
            <div className="mini-label">Track</div>
            <div className="mini-value">{showHurricaneTrackPoints ? "On" : "Off"}</div>
          </div>
        </>
      ) : null}

      <div className="mini-block">
        <div className="mini-label">{mode === "hurricane" ? "Advisory" : "Date"}</div>
        <div className="mini-value">{formatMiniDate(mode, selectedDate)}</div>
      </div>

      <div className="mini-block">
        <div className="mini-label">Run</div>
        <div className="mini-value">{formatRunLabel(selectedRun)}</div>
      </div>

      <div className="mini-block">
        <div className="mini-label">Layer</div>
        <div className="mini-value">{primaryLayer === "maxele" ? "Water" : "Wave"}</div>
      </div>

      <div className="mini-block">
        <div className="mini-label">Base</div>
        <div className="mini-value">{basemap}</div>
      </div>

      <div className="mini-block">
        <label className="mini-toggle">
          <input
            type="checkbox"
            checked={stationsVisible}
            onChange={(e) => onStationsVisibleChange(e.target.checked)}
          />
          <span>Stations</span>
        </label>
      </div>
    </aside>
  );
}

export default function Sidebar(props) {
  const {
    collapsed,
    onCollapseToggle,
    mode,
    selectedDate,
    liveDates,
    onDateChange,
    availableRuns,
    selectedRun,
    onRunChange,
    latestDateOverall,
    latestRunOverall,
    stationsVisible,
    onStationsVisibleChange,
    opacity,
    onOpacityChange,
    basemap,
    onBasemapChange,
    primaryLayer,
    onPrimaryLayerChange,
    waveLayerAvailable,
    //showHurricaneCone,
    //onShowHurricaneConeChange,
    showHurricaneTrackPoints,
    onShowHurricaneTrackPointsChange,
    archiveYears,
    selectedYear,
    onYearChange,
    availableStorms,
    selectedStorm,
    onStormChange,
    availableAdvisories,
    selectedAdvisory,
    onAdvisoryChange,
    availableHurricaneStorms,
    selectedHurricaneStorm,
    onHurricaneStormChange,
    availableMeshes,
    selectedMesh,
    onMeshChange,
    layerConfig
  } = props;

  if (collapsed) {
    return (
      <MiniSidebar
        mode={mode}
        selectedDate={selectedDate}
        selectedRun={selectedRun}
        stationsVisible={stationsVisible}
        onStationsVisibleChange={onStationsVisibleChange}
        basemap={basemap}
        primaryLayer={primaryLayer}
        onExpand={onCollapseToggle}
        selectedMesh={selectedMesh}
        availableMeshes={availableMeshes}
        selectedHurricaneStorm={selectedHurricaneStorm}
        availableHurricaneStorms={availableHurricaneStorms}
        //showHurricaneCone={showHurricaneCone}
        showHurricaneTrackPoints={showHurricaneTrackPoints}
      />
    );
  }

  return (
    <aside className="sidebar full-sidebar">
      <div className="sidebar-header-row">
        <h2>Forecast Controls</h2>
        <button
          className="sidebar-toggle"
          type="button"
          onClick={onCollapseToggle}
          title="Collapse controls"
        >
          ⟨
        </button>
      </div>

      {mode === "archive" ? (
        <>
          <SidebarSection title="Archive Selection">
            <label htmlFor="archive-year">Year</label>
            <select
              id="archive-year"
              value={selectedYear}
              onChange={(e) => onYearChange(e.target.value)}
            >
              {archiveYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <label htmlFor="archive-storm">Storm</label>
            <select
              id="archive-storm"
              value={selectedStorm}
              onChange={(e) => onStormChange(e.target.value)}
            >
              {availableStorms.map((storm) => (
                <option key={storm} value={storm}>
                  {storm}
                </option>
              ))}
            </select>

            <label htmlFor="archive-advisory">Advisory / Run</label>
            <select
              id="archive-advisory"
              value={selectedAdvisory}
              onChange={(e) => onAdvisoryChange(e.target.value)}
            >
              {availableAdvisories.map((advisory) => (
                <option key={advisory} value={advisory}>
                  {advisory}
                </option>
              ))}
            </select>
          </SidebarSection>

          <SidebarSection title="Layer">
            <select
              id="primary-layer"
              value={primaryLayer}
              onChange={(e) => onPrimaryLayerChange(e.target.value)}
            >
              <option value="maxele">Maximum Water Level (ft NAVD88)</option>
              {waveLayerAvailable ? (
                <option value="swan_HS_max">Maximum Significant Wave Height (ft)</option>
              ) : null}
            </select>

            {!waveLayerAvailable ? (
              <div className="field-help">Wave layer not available for this date/run.</div>
            ) : null}
          </SidebarSection>
        </>
      ) : mode === "hurricane" ? (
        <>
          <SidebarSection title="Region">
            <label htmlFor="forecast-region">Region</label>
            <select
              id="forecast-region"
              value={selectedMesh}
              onChange={(e) => onMeshChange(e.target.value)}
            >
              {availableMeshes.map((mesh) => (
                <option key={mesh.key} value={mesh.key}>
                  {mesh.label}
                </option>
              ))}
            </select>
          </SidebarSection>

          <SidebarSection title="Storm Forecast">
            <label htmlFor="hurricane-storm">Storm</label>
            <select
              id="hurricane-storm"
              value={selectedHurricaneStorm}
              onChange={(e) => onHurricaneStormChange(e.target.value)}
            >
              {availableHurricaneStorms.map((storm) => (
                <option key={storm.key} value={storm.key}>
                  {storm.label}
                </option>
              ))}
            </select>

            <label htmlFor="forecast-advisory">Advisory</label>
            <select
              id="forecast-advisory"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
            >
              {liveDates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </SidebarSection>

          <SidebarSection title="Forecast Run">
            <label>
              Runs for {selectedDate || "--"} ({availableRuns.length} available)
            </label>
            <RunPills
              runs={availableRuns}
              selectedRun={selectedRun}
              onRunChange={onRunChange}
              latestRun={latestRunOverall}
              selectedDate={selectedDate}
              latestDateOverall={latestDateOverall}
            />
          </SidebarSection>

          <SidebarSection title="Layer">
            <select
              id="primary-layer"
              value={primaryLayer}
              onChange={(e) => onPrimaryLayerChange(e.target.value)}
            >
              <option value="maxele">Maximum Water Level (ft NAVD88)</option>
              {waveLayerAvailable ? (
                <option value="swan_HS_max">Maximum Significant Wave Height (ft)</option>
              ) : null}
            </select>

            {!waveLayerAvailable ? (
              <div className="field-help">Wave layer not available for this date/run.</div>
            ) : null}
          </SidebarSection>

          <SidebarSection title="Overlays">
            <div className="toggle-row">
              <input
                id="hurricane-track-toggle"
                type="checkbox"
                checked={showHurricaneTrackPoints}
                onChange={(e) => onShowHurricaneTrackPointsChange(e.target.checked)}
              />
              <label htmlFor="hurricane-track-toggle">Show Track &amp; Points</label>
            </div>
          </SidebarSection>
        </>
      ) : (
        <>
          <SidebarSection title="Region">
            <label htmlFor="forecast-region">Region</label>
            <select
              id="forecast-region"
              value={selectedMesh}
              onChange={(e) => onMeshChange(e.target.value)}
            >
              {availableMeshes.map((mesh) => (
                <option key={mesh.key} value={mesh.key}>
                  {mesh.label}
                </option>
              ))}
            </select>
          </SidebarSection>

          <SidebarSection title="Forecast">
            <label htmlFor="forecast-date">Available Date</label>
            <input
              id="forecast-date"
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              list="available-live-dates"
            />
            <datalist id="available-live-dates">
              {liveDates.map((date) => (
                <option key={date} value={date} />
              ))}
            </datalist>
          </SidebarSection>

          <SidebarSection title="Forecast Run">
            <label>
              Runs for {selectedDate || "--"} ({availableRuns.length} available)
            </label>
            <RunPills
              runs={availableRuns}
              selectedRun={selectedRun}
              onRunChange={onRunChange}
              latestRun={latestRunOverall}
              selectedDate={selectedDate}
              latestDateOverall={latestDateOverall}
            />
          </SidebarSection>

          <SidebarSection title="Layer">
            <label htmlFor="primary-layer">Layer</label>
            <select
              id="primary-layer"
              value={primaryLayer}
              onChange={(e) => onPrimaryLayerChange(e.target.value)}
            >
              <option value="maxele">Maximum Water Level (ft NAVD88)</option>
              {waveLayerAvailable ? (
                <option value="swan_HS_max">Maximum Significant Wave Height (ft)</option>
              ) : null}
            </select>

            {!waveLayerAvailable ? (
              <div className="field-help">Wave layer not available for this date/run.</div>
            ) : null}
          </SidebarSection>
        </>
      )}

      <SidebarSection title="Display">
        <label htmlFor="basemap-select">Basemap</label>
        <select
          id="basemap-select"
          value={basemap}
          onChange={(e) => onBasemapChange(e.target.value)}
        >
          <option value="aerial">Aerial</option>
          <option value="charcoal">Charcoal</option>
          <option value="light">Light</option>
          <option value="topo">Topo</option>
          
        </select>

        <div className="toggle-row">
          <input
            id="stations-toggle"
            type="checkbox"
            checked={stationsVisible}
            onChange={(e) => onStationsVisibleChange(e.target.checked)}
          />
          <label htmlFor="stations-toggle">Show NOAA Stations</label>
        </div>

        <label htmlFor="opacity-range">
          {layerConfig?.label || "Overlay"} Opacity: {opacity}%
        </label>
        <input
          id="opacity-range"
          type="range"
          min="0"
          max="100"
          step="5"
          value={opacity}
          onChange={(e) => onOpacityChange(Number(e.target.value))}
        />
      </SidebarSection>
    </aside>
  );
}