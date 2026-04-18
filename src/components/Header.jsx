import React from "react";
import uga from "../assets/uga.png";
import twi from "../assets/twi.png";

export default function Header() {
  return (
    <header className="header">
      <div className="title-left">UGA Coastal Flood Forecast Viewer</div>
      <div className="logo-group" aria-label="Partner logos">
        <div className="logo-card">
          <img src={uga} className="logo uga" alt="UGA Coast logo" />
        </div>
        <div className="logo-card">
          <img src={twi} className="logo twi" alt="The Water Institute logo" />
        </div>
      </div>
    </header>
  );
}
