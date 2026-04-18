import React from "react";

export default function TopBar({ mode, onModeChange, statusText, activeLayerText }) {
  return (
    <div className="top-bar">
      <div className="mode-toggle">
        <button
          className={mode === "daily" ? "active daily" : "daily"}
          onClick={() => onModeChange("daily")}
          type="button"
        >
          Daily
        </button>
        <button
          className={mode === "hurricane" ? "active hurricane" : "hurricane"}
          onClick={() => onModeChange("hurricane")}
          type="button"
        >
          Hurricane
        </button>
        <button
          className={mode === "archive" ? "active archive" : "archive"}
          onClick={() => onModeChange("archive")}
          type="button"
        >
          Archive
        </button>
      </div>

      {/* 👇 Updated status + layer display */}
      <div className="status-display">
        <div className="topbar-status-group">
          <div className="topbar-status-text">{statusText}</div>

          {activeLayerText && (
            <div className="topbar-layer-badge">
              {activeLayerText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}