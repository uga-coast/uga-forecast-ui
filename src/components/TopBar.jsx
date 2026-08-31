import React from "react";

export default function TopBar({
  mode,
  onModeChange,
  statusText,
  activeLayerText,
  onShare,
  shareStatus
}) {
  return (
    <nav className="top-bar" aria-label="Forecast mode and status">
      <div className="mode-toggle" role="group" aria-label="Forecast mode">
        <button
          className={mode === "daily" ? "active daily" : "daily"}
          onClick={() => onModeChange("daily")}
          type="button"
          aria-pressed={mode === "daily"}
        >
          Daily
        </button>
        <button
          className={mode === "hurricane" ? "active hurricane" : "hurricane"}
          onClick={() => onModeChange("hurricane")}
          type="button"
          aria-pressed={mode === "hurricane"}
        >
          Hurricane
        </button>
        <button
          className={mode === "archive" ? "active archive" : "archive"}
          onClick={() => onModeChange("archive")}
          type="button"
          aria-pressed={mode === "archive"}
        >
          Archive
        </button>
      </div>

      <div className="status-display">
        <div className="topbar-status-group">
          <div className="topbar-status-text" aria-live="polite">{statusText}</div>

          {activeLayerText && (
            <div className="topbar-layer-badge">
              {activeLayerText}
            </div>
          )}

          <button
            className="share-link-button"
            type="button"
            onClick={onShare}
            aria-label="Copy a link to this forecast view"
          >
            Copy link
          </button>

          <span className="share-link-status" aria-live="polite">
            {shareStatus}
          </span>
        </div>
      </div>
    </nav>
  );
}
