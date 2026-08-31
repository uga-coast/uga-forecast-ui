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

function formatAdvisoryLabel(advisory) {
  if (!advisory) return "--";

  const number = String(advisory).match(/(\d+)$/)?.[1];
  return number ? `Advisory ${Number(number)}` : advisory;
}

function formatMiniDate(mode, selectedDate) {
  if (!selectedDate) return "--";
  if (mode === "hurricane" || mode === "archive") {
    return formatAdvisoryLabel(selectedDate);
  }
  return selectedDate.replace("2026-", "");
}

function formatDailyDate(dateValue) {
  if (!dateValue) return "--";

  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateValue;

  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
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
            aria-pressed={selectedRun === run}
          >
            <span>{formatRunLabel(run)}</span>
            {isLatest ? <span className="run-pill-tag">Latest</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function ForecastNavigator({
  values,
  selectedValue,
  selectedRun,
  latestRun,
  onChange,
  itemLabel
}) {
  if (!values.length) return null;

  const selectedIndex = values.indexOf(selectedValue);
  const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const olderValue = values[currentIndex + 1] || null;
  const newerValue = currentIndex > 0 ? values[currentIndex - 1] : null;
  const isLatest = selectedValue === values[0] && selectedRun === latestRun;
  const navigatorSummary =
    itemLabel === "Forecast date"
      ? currentIndex === 0
        ? "Latest available forecast"
        : currentIndex === values.length - 1
          ? "Oldest available forecast"
          : `Viewing ${formatDailyDate(selectedValue)}`
      : `${currentIndex + 1} of ${values.length}`;

  function handleKeyDown(event) {
    if (event.key === "ArrowLeft" && olderValue) {
      event.preventDefault();
      onChange(olderValue);
    }

    if (event.key === "ArrowRight" && newerValue) {
      event.preventDefault();
      onChange(newerValue);
    }

    if (event.key === "Home" && !isLatest) {
      event.preventDefault();
      onChange(values[0]);
    }
  }

  return (
    <div
      className="forecast-navigator"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`${itemLabel} navigation. ${navigatorSummary}.`}
    >
      <div className="forecast-navigator-status">
        <span>{itemLabel}</span>
        <strong>{navigatorSummary}</strong>
      </div>

      <div className="forecast-navigator-actions">
        <button
          type="button"
          onClick={() => olderValue && onChange(olderValue)}
          disabled={!olderValue}
        >
          ← Older
        </button>
        <button
          type="button"
          className="forecast-latest-button"
          onClick={() => onChange(values[0])}
          disabled={isLatest}
        >
          Latest
        </button>
        <button
          type="button"
          onClick={() => newerValue && onChange(newerValue)}
          disabled={!newerValue}
        >
          Newer →
        </button>
      </div>

      <div className="forecast-navigator-help">
        Focus here and use ←/→; Home returns to latest.
      </div>
    </div>
  );
}

function DailyForecastNavigator({
  dates,
  runsByDate,
  selectedDate,
  selectedRun,
  onDateChange,
  onRunChange
}) {
  const cycles = dates.flatMap((date) =>
    [...(runsByDate?.[date] || [])]
      .reverse()
      .map((run) => ({ date, run, key: `${date}|${run}` }))
  );

  if (!cycles.length) return null;

  const selectedKey = `${selectedDate}|${selectedRun}`;
  const selectedIndex = cycles.findIndex((cycle) => cycle.key === selectedKey);
  const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const olderCycle = cycles[currentIndex + 1] || null;
  const newerCycle = currentIndex > 0 ? cycles[currentIndex - 1] : null;
  const isLatest = currentIndex === 0 && selectedIndex === 0;
  const navigatorSummary =
    currentIndex === 0
      ? "Latest available forecast"
      : currentIndex === cycles.length - 1
        ? "Oldest available forecast"
        : `Viewing ${formatDailyDate(cycles[currentIndex].date)} • ${formatRunLabel(cycles[currentIndex].run)}`;

  function selectCycle(cycle) {
    if (!cycle) return;
    onDateChange(cycle.date);
    onRunChange(cycle.run);
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowLeft" && olderCycle) {
      event.preventDefault();
      selectCycle(olderCycle);
    }

    if (event.key === "ArrowRight" && newerCycle) {
      event.preventDefault();
      selectCycle(newerCycle);
    }

    if (event.key === "Home" && !isLatest) {
      event.preventDefault();
      selectCycle(cycles[0]);
    }
  }

  return (
    <div
      className="forecast-navigator"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`Forecast cycle navigation. ${navigatorSummary}.`}
    >
      <div className="forecast-navigator-status">
        <span>Forecast cycle</span>
        <strong>{navigatorSummary}</strong>
      </div>

      <div className="forecast-navigator-actions">
        <button
          type="button"
          onClick={() => selectCycle(olderCycle)}
          disabled={!olderCycle}
        >
          ← Older
        </button>
        <button
          type="button"
          className="forecast-latest-button"
          onClick={() => selectCycle(cycles[0])}
          disabled={isLatest}
        >
          Latest
        </button>
        <button
          type="button"
          onClick={() => selectCycle(newerCycle)}
          disabled={!newerCycle}
        >
          Newer →
        </button>
      </div>

      <div className="forecast-navigator-help">
        Focus here and use ←/→; Home returns to latest.
      </div>
    </div>
  );
}

function MiniSidebar({
  mode,
  selectedDate,
  selectedRun,
  stationsVisible,
  onStationsVisibleChange,
  pointHydrographEnabled,
  onPointHydrographEnabledChange,
  pointHydrographAvailable,
  basemap,
  primaryLayer,
  onExpand,
  selectedMesh,
  availableMeshes,
  selectedHurricaneStorm,
  availableHurricaneStorms,
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
    <aside className="sidebar mini-sidebar" aria-label="Compact forecast controls">
      <button
        className="sidebar-toggle"
        type="button"
        onClick={onExpand}
        title="Expand controls"
        aria-label="Expand forecast controls"
      >
        ⟩
      </button>

      <div className="mini-block mini-mode-summary">
        <div className="mini-label">Mode</div>
        <div className={"mini-mode-badge " + mode}>{mode}</div>
      </div>

      <div className="mini-block mini-primary-summary">
        <div className="mini-label">Region</div>
        <div className="mini-value">{meshLabel}</div>
      </div>

      {mode === "hurricane" ? (
        <>
          <div className="mini-block mini-primary-summary">
            <div className="mini-label">Storm</div>
            <div className="mini-value">{hurricaneStormLabel}</div>
          </div>

          <div className="mini-block mini-secondary-summary">
            <div className="mini-label">Track</div>
            <div className="mini-value">{showHurricaneTrackPoints ? "On" : "Off"}</div>
          </div>
        </>
      ) : null}

      <div className="mini-block mini-primary-summary">
        <div className="mini-label">
          {mode === "hurricane" || mode === "archive" ? "Advisory" : "Date"}
        </div>
        <div className="mini-value">{formatMiniDate(mode, selectedDate)}</div>
      </div>

      <div className="mini-block mini-primary-summary">
        <div className="mini-label">Run</div>
        <div className="mini-value">{formatRunLabel(selectedRun)}</div>
      </div>

      <div className="mini-block mini-secondary-summary">
        <div className="mini-label">Layer</div>
        <div className="mini-value">{primaryLayer === "maxele" ? "Water" : "Wave"}</div>
      </div>

      <div className="mini-block mini-secondary-summary">
        <div className="mini-label">Base</div>
        <div className="mini-value">{basemap}</div>
      </div>

      <div className="mini-block mini-secondary-summary">
        <label className="mini-toggle">
          <input
            type="checkbox"
            checked={stationsVisible}
            onChange={(e) => onStationsVisibleChange(e.target.checked)}
          />
          <span>Stations</span>
        </label>
      </div>

      <div className="mini-block mini-secondary-summary">
        <label className="mini-toggle">
          <input
            type="checkbox"
            checked={pointHydrographEnabled}
            disabled={!pointHydrographAvailable}
            onChange={(e) =>
              onPointHydrographEnabledChange(e.target.checked)
            }
          />
          <span>Hydrograph</span>
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
    runsByDate,
    onDateChange,
    availableRuns,
    selectedRun,
    onRunChange,
    latestDateOverall,
    latestRunOverall,
    stationsVisible,
    onStationsVisibleChange,
    pointHydrographEnabled,
    onPointHydrographEnabledChange,
    pointHydrographAvailable,
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
        pointHydrographEnabled={pointHydrographEnabled}
        onPointHydrographEnabledChange={onPointHydrographEnabledChange}
        pointHydrographAvailable={pointHydrographAvailable}
        basemap={basemap}
        primaryLayer={primaryLayer}
        onExpand={onCollapseToggle}
        selectedMesh={selectedMesh}
        availableMeshes={availableMeshes}
        selectedHurricaneStorm={selectedHurricaneStorm}
        availableHurricaneStorms={availableHurricaneStorms}
        showHurricaneTrackPoints={showHurricaneTrackPoints}
      />
    );
  }

  return (
    <aside className="sidebar full-sidebar" aria-label="Forecast controls">
      <div className="sidebar-header-row">
        <h2>Forecast Controls</h2>
        <button
          className="sidebar-toggle"
          type="button"
          onClick={onCollapseToggle}
          title="Collapse controls"
          aria-label="Collapse forecast controls"
        >
          ⟨
        </button>
      </div>

      {mode === "archive" ? (
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
              <option key={storm.key} value={storm.key}>
                {storm.label}
              </option>
            ))}
          </select>

          <label htmlFor="archive-advisory">Advisory</label>
          <select
            id="archive-advisory"
            value={selectedAdvisory}
            onChange={(e) => onAdvisoryChange(e.target.value)}
          >
              {availableAdvisories.map((advisory) => (
                <option key={advisory} value={advisory}>
                  {formatAdvisoryLabel(advisory)}
                </option>
              ))}
          </select>

          <ForecastNavigator
            values={availableAdvisories}
            selectedValue={selectedAdvisory}
            selectedRun={selectedRun}
            latestRun={latestRunOverall}
            onChange={onAdvisoryChange}
            itemLabel="Advisory"
          />
        </SidebarSection>

        <SidebarSection title="Forecast Run">
          <label>
            Runs for {formatAdvisoryLabel(selectedAdvisory)} ({availableRuns.length} available)
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

          {availableHurricaneStorms.length === 0 ? (
            <SidebarSection title="Storm Forecast">
              <div className="field-help">
                No active hurricane forecasts available. Historical storms can be viewed in Archive mode.
              </div>
            </SidebarSection>
          ) : (
            <>
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
                      {formatAdvisoryLabel(date)}
                    </option>
                  ))}
                </select>

                <ForecastNavigator
                  values={liveDates}
                  selectedValue={selectedDate}
                  selectedRun={selectedRun}
                  latestRun={latestRunOverall}
                  onChange={onDateChange}
                  itemLabel="Advisory"
                />
              </SidebarSection>

              <SidebarSection title="Forecast Run">
                <label>
                  Runs for {formatAdvisoryLabel(selectedDate)} ({availableRuns.length} available)
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
            </>
          )}

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

            <DailyForecastNavigator
              dates={liveDates}
              runsByDate={runsByDate}
              selectedDate={selectedDate}
              selectedRun={selectedRun}
              onDateChange={onDateChange}
              onRunChange={onRunChange}
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

        <div className="toggle-row">
          <input
            id="point-hydrograph-toggle"
            type="checkbox"
            checked={pointHydrographEnabled}
            disabled={!pointHydrographAvailable}
            onChange={(e) => onPointHydrographEnabledChange(e.target.checked)}
          />
          <label htmlFor="point-hydrograph-toggle">
            Click Map for Hydrograph
          </label>
        </div>

        {!pointHydrographAvailable && (
          <div className="field-help">
            Hydrographs unavailable for this run.
          </div>
        )}

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
