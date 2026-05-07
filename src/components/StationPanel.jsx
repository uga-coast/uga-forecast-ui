import React, { useEffect, useMemo, useRef, useState } from "react";

function formatUtcTimestamp(timestamp) {
  if (!timestamp) return "—";
  return `${timestamp} UTC`;
}

function parseUtcDate(timestamp) {
  if (!timestamp) return null;

  let iso = String(timestamp).trim();

  // Convert "YYYY-MM-DD HH:MM:SS" to ISO-like form
  if (iso.includes(" ") && !iso.includes("T")) {
    iso = iso.replace(" ", "T");
  }

  // Only append Z if there is not already a timezone
  const hasTimezone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(iso);
  if (!hasTimezone) {
    iso = `${iso}Z`;
  }

  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatNoaaApiDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${d} ${h}:${min}`;
}

function buildNoaaWindow(cycleTimestamp, runMeta, hoursBack = 48, hoursForward = 48) {
  const cycleDate = parseUtcDate(cycleTimestamp);
  if (!cycleDate) return null;

  const begin = new Date(cycleDate.getTime() - hoursBack * 60 * 60 * 1000);

  let end;
  const isHistoricalHurricane =
    runMeta?.forecastType === "hurricane";

  if (isHistoricalHurricane) {
    end = new Date(cycleDate.getTime() + hoursForward * 60 * 60 * 1000);
  } else {
    end = new Date();
  }

  return {
    beginDate: formatNoaaApiDate(begin),
    endDate: formatNoaaApiDate(end)
  };
}

function formatObservedValue(observation) {
  if (observation?.v == null) return "—";
  const value = Number(observation.v);
  return Number.isFinite(value) ? `${value.toFixed(2)} ft NAVD88` : "—";
}

function formatForecastValue(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} ft NAVD88` : "—";
}

function formatTooltipTime(timeMs) {
  const d = new Date(timeMs);
  return `${d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  })} ${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes()
  ).padStart(2, "0")} UTC`;
}

function findNearestPoint(series, timeMs) {
  if (!series?.length) return null;

  return series.reduce((best, point) => {
    const diff = Math.abs(point.date.getTime() - timeMs);
    return !best || diff < best.diff ? { ...point, diff } : best;
  }, null);
}

function getYAxisTickStep(min, max) {
  const range = max - min;
  if (range <= 6) return 0.5;
  if (range <= 12) return 1;
  if (range <= 20) return 2;
  if (range <= 40) return 5;
  return 10;
}

function normalizeObservedSeries(noaaData) {
  return (noaaData || [])
    .map((d) => {
      const value = Number(d.v);
      const date = parseUtcDate(d.t);
      if (!Number.isFinite(value) || !date) return null;
      return {
        timestamp: d.t,
        date,
        value
      };
    })
    .filter(Boolean);
}

function normalizeForecastSeries(stationForecast) {
  if (!stationForecast?.time_date || !stationForecast?.zeta) return [];

  const n = Math.min(stationForecast.time_date.length, stationForecast.zeta.length);

  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const timestamp = stationForecast.time_date[i];
    const value = Number(stationForecast.zeta[i]);
    const date = parseUtcDate(timestamp);

    if (!Number.isFinite(value) || !date) continue;

    rows.push({
      timestamp,
      date,
      value
    });
  }

  return rows;
}

function getChartStats(observedSeries, forecastSeries) {
  const values = [...observedSeries, ...forecastSeries]
    .map((d) => d.value)
    .filter((v) => Number.isFinite(v));

  if (!values.length) return null;

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);

  const span = rawMax - rawMin;
  const pad = Math.max(0.2, span * 0.1);

  let min = Math.min(rawMin - pad, 0);
  let max = Math.max(rawMax + pad, 0);

  min = Math.floor(min / 0.5) * 0.5;
  max = Math.ceil(max / 0.5) * 0.5;

  return { min, max };
}

function getTimeDomain(observedSeries, forecastSeries) {
  const dates = [...observedSeries, ...forecastSeries]
    .map((d) => d.date.getTime())
    .filter(Number.isFinite);

  if (!dates.length) return null;

  const min = Math.min(...dates);
  const max = Math.max(...dates);

  const sixHoursMs = 6 * 60 * 60 * 1000;

  return {
    min,
    max: max + sixHoursMs
  };
}

function scaleX(timeMs, domain, width, margin) {
  const usableWidth = width - margin.left - margin.right;
  const range = Math.max(domain.max - domain.min, 1);
  return margin.left + ((timeMs - domain.min) / range) * usableWidth;
}

function scaleY(value, chartStats, height, margin) {
  const usableHeight = height - margin.top - margin.bottom;
  const range = Math.max(chartStats.max - chartStats.min, 1);
  return height - margin.bottom - ((value - chartStats.min) / range) * usableHeight;
}

function buildTimePolyline(series, width, height, margin, domain, chartStats) {
  if (!series.length || !domain || !chartStats) return "";

  return series
    .map(
      (d) =>
        `${scaleX(d.date.getTime(), domain, width, margin)},${scaleY(d.value, chartStats, height, margin)}`
    )
    .join(" ");
}

function buildGridLines(width, height, margin, chartStats, step) {
  if (!chartStats) return null;

  const lines = [];
  for (let v = chartStats.min; v <= chartStats.max + 1e-9; v += step) {
    const y = scaleY(v, chartStats, height, margin);
    lines.push(
      <line
        key={`grid-${v}`}
        x1={margin.left}
        y1={y}
        x2={width - margin.right}
        y2={y}
        stroke="#dbe3ee"
        strokeWidth="1"
      />
    );
  }
  return lines;
}

function getTimeTickStepHours(domain, chartWidth, margin) {
  if (!domain) return 6;

  const usableWidth = Math.max(chartWidth - margin.left - margin.right, 1);
  const totalHours = (domain.max - domain.min) / (1000 * 60 * 60);

  const targetTickCount = Math.max(4, Math.floor(usableWidth / 90));
  const hoursPerTick = totalHours / targetTickCount;

  if (hoursPerTick <= 3) return 3;
  if (hoursPerTick <= 6) return 6;
  if (hoursPerTick <= 12) return 12;
  if (hoursPerTick <= 24) return 24;
  return 48;
}

function buildTimeTicks(domain, stepHours = 6) {
  if (!domain) return [];

  const ticks = [];
  const start = new Date(domain.min);
  start.setUTCMinutes(0, 0, 0);

  const firstHour = start.getUTCHours();
  const offset = (stepHours - (firstHour % stepHours)) % stepHours;
  start.setUTCHours(firstHour + offset);

  for (let t = start.getTime(); t <= domain.max; t += stepHours * 60 * 60 * 1000) {
    const d = new Date(t);
    ticks.push({
      timeMs: t,
      date: d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC"
      }),
      time: `${String(d.getUTCHours()).padStart(2, "0")}Z`
    });
  }

  return ticks;
}

export default function StationPanel({
  station,
  forecastJsonUrl,
  forecastCycleTime,
  runMeta,
  onClose,
  onResizeStart
}) {

  const [noaaData, setNoaaData] = useState([]);
  const [noaaStatus, setNoaaStatus] = useState("idle");

  const [forecastSeries, setForecastSeries] = useState([]);
  const [forecastStatus, setForecastStatus] = useState("idle");

  const [hoverData, setHoverData] = useState(null);

  const chartContainerRef = useRef(null);
  const [chartSize, setChartSize] = useState({ width: 1000, height: 220 });

  const chartWidth = chartSize.width;
  const chartHeight = chartSize.height;

  const axisTickFontSize = Math.max(11, Math.min(14, Math.round(chartHeight * 0.055)));
  const axisLabelFontSize = Math.max(12, Math.min(16, Math.round(chartHeight * 0.065)));
  const tickLength = Math.max(5, Math.min(8, Math.round(chartHeight * 0.025)));

  useEffect(() => {
    if (!station?.id || !forecastCycleTime) {
      setNoaaData([]);
      setNoaaStatus("idle");
      return;
    }

    let cancelled = false;

    async function fetchNoaaData() {
      setNoaaStatus("loading");
      setNoaaData([]);

      const window = buildNoaaWindow(forecastCycleTime, runMeta, 48, 48);
      if (!window) {
        setNoaaStatus("error");
        return;
      }

      const params = new URLSearchParams({
        product: "water_level",
        station: station.id,
        begin_date: window.beginDate,
        end_date: window.endDate,
        datum: "NAVD",
        units: "english",
        time_zone: "gmt",
        format: "json",
        application: "forecast-ui"
      });

      const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${params.toString()}`;

      try {
        const response = await fetch(url);
        const payload = await response.json();

        if (cancelled) return;

        if (response.ok && Array.isArray(payload?.data) && payload.data.length > 0) {
          setNoaaData(payload.data);
          setNoaaStatus("ready");
        } else {
          setNoaaStatus("empty");
        }
      } catch {
        if (!cancelled) setNoaaStatus("error");
      }
    }

    fetchNoaaData();

    return () => {
      cancelled = true;
    };
  }, [station, forecastCycleTime]);

  useEffect(() => {
    if (!station?.id || !forecastJsonUrl) {
      setForecastSeries([]);
      setForecastStatus("idle");
      return;
    }

    let cancelled = false;

    async function fetchForecastData() {
      setForecastStatus("loading");
      setForecastSeries([]);

      try {
        const response = await fetch(forecastJsonUrl);
        if (!response.ok) throw new Error("Forecast JSON not found");

        const payload = await response.json();
        if (cancelled) return;

        const stationForecast = payload?.[station.id];
        const series = normalizeForecastSeries(stationForecast);

        if (series.length) {
          setForecastSeries(series);
          setForecastStatus("ready");
        } else {
          setForecastStatus("empty");
        }
      } catch {
        if (!cancelled) setForecastStatus("error");
      }
    }

    fetchForecastData();

    return () => {
      cancelled = true;
    };
  }, [station, forecastJsonUrl]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const el = chartContainerRef.current;

    function updateSize() {
      const nextWidth = Math.max(520, Math.floor(el.clientWidth || 1000));
      const nextHeight = Math.max(180, Math.floor(el.clientHeight || 220));

      setChartSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) return prev;
        return { width: nextWidth, height: nextHeight };
      });
    }

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });

    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  const observedSeries = useMemo(() => {
    return normalizeObservedSeries(noaaData);
  }, [noaaData]);

  const latestObservation = useMemo(() => {
    if (!observedSeries.length) return null;
    const last = observedSeries[observedSeries.length - 1];
    return { t: last.timestamp, v: last.value };
  }, [observedSeries]);

  const latestForecast = useMemo(() => {
    if (!forecastSeries.length) return null;
    return forecastSeries[forecastSeries.length - 1];
  }, [forecastSeries]);

  const peakForecast = useMemo(() => {
    if (!forecastSeries.length) return null;
    return forecastSeries.reduce(
      (best, row) => (best == null || row.value > best.value ? row : best),
      null
    );
  }, [forecastSeries]); 

  const margin = {
    top: 12,
    right: 18,
    bottom: axisTickFontSize + 32,
    left: axisTickFontSize * 4.5
  };

  const chartStats = useMemo(
    () => getChartStats(observedSeries, forecastSeries),
    [observedSeries, forecastSeries]
  );

  const yTickStep = useMemo(() => {
    if (!chartStats) return 1;
    return getYAxisTickStep(chartStats.min, chartStats.max);
  }, [chartStats]);

  const selectionKey = `${station?.id || ""}|${forecastJsonUrl || ""}|${forecastCycleTime || ""}`;

  const timeDomain = useMemo(() => {
    return getTimeDomain(observedSeries, forecastSeries);
  }, [selectionKey, observedSeries, forecastSeries]);

  const observedPolyline = useMemo(() => {
    return buildTimePolyline(
      observedSeries,
      chartWidth,
      chartHeight,
      margin,
      timeDomain,
      chartStats
    );
  }, [observedSeries, chartWidth, chartHeight, margin, timeDomain, chartStats]);

  const forecastPolyline = useMemo(() => {
    return buildTimePolyline(
      forecastSeries,
      chartWidth,
      chartHeight,
      margin,
      timeDomain,
      chartStats
    );
  }, [forecastSeries, chartWidth, chartHeight, margin, timeDomain, chartStats]);

  const xTickStepHours = useMemo(
    () => getTimeTickStepHours(timeDomain, chartWidth, margin),
    [timeDomain, chartWidth, margin]
  );

  const xTicks = useMemo(
    () => buildTimeTicks(timeDomain, xTickStepHours),
    [timeDomain, xTickStepHours]
  );

  const hasAnyChartData = Boolean(observedPolyline || forecastPolyline);

  function handleChartMouseMove(event) {
    if (!timeDomain || !chartStats) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const usableWidth = chartWidth - margin.left - margin.right;
    const ratio = Math.max(0, Math.min(1, (mouseX - margin.left) / usableWidth));
    const timeMs = timeDomain.min + ratio * (timeDomain.max - timeDomain.min);

    setHoverData({
      timeMs,
      x: scaleX(timeMs, timeDomain, chartWidth, margin),
      mouseX,
      mouseY: event.clientY - rect.top,
      observed: findNearestPoint(observedSeries, timeMs),
      forecast: findNearestPoint(forecastSeries, timeMs)
    });
}

function handleChartMouseLeave() {
  setHoverData(null);
}

  return (
    <div className="station-panel-inner">
      <div className="station-resize-handle" onMouseDown={onResizeStart} title="Drag to resize">
        <div className="station-resize-grip" />
      </div>

      <div className="station-topbar">
        <div className="station-left">
          <strong className="station-name">{station.name}</strong>
          <span className="station-id">ID: {station.id}</span>
        </div>

        <div className="station-center">
          <div className="metric">
            <span className="metric-label">Peak Forecast</span>
            <span className="metric-value">
              {peakForecast ? formatForecastValue(peakForecast.value) : "—"}
            </span>
          </div>

          <div className="metric">
            <span className="metric-label">Peak Time</span>
            <span className="metric-value">
              {peakForecast ? formatUtcTimestamp(peakForecast.timestamp) : "—"}
            </span>
          </div>

          <div className="metric">
            <span className="metric-label">Latest Observed</span>
            <span className="metric-value">
              {noaaStatus === "loading" && "Loading..."}
              {noaaStatus === "error" && "NOAA load failed"}
              {noaaStatus === "empty" && "No data"}
              {noaaStatus === "ready" && formatObservedValue(latestObservation)}
              {noaaStatus === "idle" && "—"}
            </span>
          </div>

          <div className="metric">
            <span className="metric-label">Observed Time</span>
            <span className="metric-value">
              {noaaStatus === "ready" ? formatUtcTimestamp(latestObservation?.t) : "—"}
            </span>
          </div>
        </div>

        <button className="station-close" onClick={onClose} type="button">
          Close
        </button>
      </div>

      <div className="station-chart">
        <div className="chart-placeholder">
          <div className="chart-title">Observed and Forecast Water Level</div>
          <div className="chart-subtitle">
            {runMeta?.forecastType === "hurricane"
              ? `Advisory ${runMeta?.advisory || "—"} · Forecast cycle: ${forecastCycleTime ? formatUtcTimestamp(forecastCycleTime) : "—"}`
              : `Forecast cycle: ${forecastCycleTime ? formatUtcTimestamp(forecastCycleTime) : "—"}`}
          </div>
          <div
            className="chart-box"
            style={{ position: "relative" }}
            ref={chartContainerRef}
          >
            {noaaStatus === "loading" && forecastStatus === "loading" && (
              <div className="chart-empty-state">Loading station data…</div>
            )}

            {!hasAnyChartData && noaaStatus === "error" && forecastStatus === "error" && (
              <div className="chart-empty-state">Failed to load observed and forecast data</div>
            )}

            {!hasAnyChartData &&
              (noaaStatus === "empty" ||
                noaaStatus === "error" ||
                noaaStatus === "ready" ||
                noaaStatus === "idle") &&
              (forecastStatus === "empty" ||
                forecastStatus === "error" ||
                forecastStatus === "ready" ||
                forecastStatus === "idle") && (
                <div className="chart-empty-state">No chart data available for this station</div>
              )}

            {hasAnyChartData && (
              <>
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                onMouseMove={handleChartMouseMove}
                onMouseLeave={handleChartMouseLeave}
                className="chart-svg"
                preserveAspectRatio="xMidYMid meet"
                style={{ display: "block", width: "100%", height: `${chartHeight}px` }}
              >
                  {buildGridLines(chartWidth, chartHeight, margin, chartStats, yTickStep)}

                  {chartStats &&
                    Array.from(
                      { length: Math.round((chartStats.max - chartStats.min) / yTickStep) + 1 },
                      (_, i) => chartStats.min + i * yTickStep
                    ).map((v) => {
                      const y = scaleY(v, chartStats, chartHeight, margin);

                      return (
                        <g key={v}>
                          <line
                            x1={margin.left - tickLength}
                            x2={margin.left}
                            y1={y}
                            y2={y}
                            stroke="#555"
                          />
                          <text
                            x={margin.left - 10}
                            y={y + 3}
                            fontSize={axisTickFontSize}
                            textAnchor="end"
                            fill="#555"
                          >
                            {v.toFixed(yTickStep < 1 ? 1 : 0)}
                          </text>
                        </g>
                      );
                    })}
                
                    {forecastCycleTime && timeDomain && chartStats && (() => {
                      const cycleDate = parseUtcDate(forecastCycleTime);
                      if (!cycleDate) return null;

                      const x = scaleX(
                        cycleDate.getTime(),
                        timeDomain,
                        chartWidth,
                        margin
                      );

                      return (
                        <>
                          {/* vertical line */}
                          <line
                            x1={x}
                            x2={x}
                            y1={margin.top}
                            y2={chartHeight - margin.bottom + tickLength}
                            stroke="#475569"
                            strokeWidth="2"
                            strokeDasharray="6 4"
                          />

                          <text
                            x={x + 2}
                            y={margin.top + 12}
                            fontSize={axisTickFontSize}
                            textAnchor="right"
                            fill="#475569"
                          >
                            Forecast Start
                          </text>
                        </>
                      );
                    })()}

                  <text
                    x={18}
                    y={chartHeight / 2}
                    fontSize={axisTickFontSize}
                    fill="#555"
                    textAnchor="middle"
                    transform={`rotate(-90, 18, ${chartHeight / 2})`}
                  >
                    Water Level (ft, NAVD88)
                  </text>

                  {chartStats && chartStats.min <= 0 && chartStats.max >= 0 && (
                    <line
                      x1={margin.left}
                      x2={chartWidth - margin.right}
                      y1={scaleY(0, chartStats, chartHeight, margin)}
                      y2={scaleY(0, chartStats, chartHeight, margin)}
                      stroke="#475569"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />
                  )}

                  {forecastPolyline && (
                    <polyline
                      fill="none"
                      stroke="#dc2626"
                      strokeWidth="3"
                      points={forecastPolyline}
                    />
                  )}

                  {observedPolyline && (
                    <polyline
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="3"
                      points={observedPolyline}
                    />
                  )}

                  {hoverData && timeDomain && chartStats && (
                    <>
                      <line
                        x1={hoverData.x}
                        x2={hoverData.x}
                        y1={margin.top}
                        y2={chartHeight - margin.bottom}
                        stroke="#334155"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />

                      {hoverData.observed && (
                        <circle
                          cx={scaleX(
                            hoverData.observed.date.getTime(),
                            timeDomain,
                            chartWidth,
                            margin
                          )}
                          cy={scaleY(
                            hoverData.observed.value,
                            chartStats,
                            chartHeight,
                            margin
                          )}
                          r="4"
                          fill="#2563eb"
                        />
                      )}

                      {hoverData.forecast && (
                        <circle
                          cx={scaleX(
                            hoverData.forecast.date.getTime(),
                            timeDomain,
                            chartWidth,
                            margin
                          )}
                          cy={scaleY(
                            hoverData.forecast.value,
                            chartStats,
                            chartHeight,
                            margin
                          )}
                          r="4"
                          fill="#dc2626"
                        />
                      )}
                    </>
                  )}

                  {xTicks.map((tick, i) => {
                    const x = scaleX(tick.timeMs, timeDomain, chartWidth, margin);
                    const prev = xTicks[i - 1];
                    const showDate = !prev || prev.date !== tick.date;

                    return (
                      <g key={tick.timeMs}>
                        <line
                          x1={x}
                          x2={x}
                          y1={chartHeight - margin.bottom}
                          y2={chartHeight - margin.bottom + 6}
                          stroke="#555"
                        />
                        {showDate && (
                          <text
                            x={x}
                            y={chartHeight - margin.bottom + 16}
                            fontSize="10"
                            textAnchor="middle"
                            fill="#555"
                            fontWeight="600"
                          >
                            {tick.date}
                          </text>
                        )}
                        <text
                          x={x}
                          y={showDate ? chartHeight - margin.bottom + 30 : chartHeight - margin.bottom + 20}
                          fontSize="10"
                          textAnchor="middle"
                          fill="#555"
                        >
                          {tick.time}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                  {hoverData && (
                    <div
                      className="chart-tooltip"
                      style={{
                        left: hoverData.mouseX + 12,
                        top: hoverData.mouseY + 12
                      }}
                    >
                      <div className="chart-tooltip-time">
                        {formatTooltipTime(hoverData.timeMs)}
                      </div>
                      <div>
                        <strong>Observed:</strong>{" "}
                        {hoverData.observed ? formatForecastValue(hoverData.observed.value) : "—"}
                      </div>
                      <div>
                        <strong>Forecast:</strong>{" "}
                        {hoverData.forecast ? formatForecastValue(hoverData.forecast.value) : "—"}
                      </div>
                    </div>
                  )}

                  <div className="chart-legend-overlay">
                    <div className="chart-legend-item">
                      <span className="legend-line observed" />
                      Observed
                    </div>
                    <div className="chart-legend-item">
                      <span className="legend-line forecast" />
                      Forecast
                    </div>
                  </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}