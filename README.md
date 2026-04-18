# UGA Forecast UI

Frontend web application for the UGA coastal flood forecast system.  
Built with React and Leaflet to visualize ADCIRC model outputs, raster layers, and NOAA station data.

---

## Overview

This application provides an interactive map-based interface for exploring coastal flood forecasts, including:

- Maximum water level (ADCIRC outputs)
- Raster layers served via TiTiler
- NOAA station observations and forecasts
- Hurricane track visualization (when applicable)

The UI consumes:
- GeoTIFF data from AWS S3
- Tile services from a TiTiler backend (EC2)
- JSON APIs for station data and forecasts

---

## Tech Stack

- React
- Leaflet (react-leaflet)
- Vite (or CRA if applicable)
- AWS S3 (data storage)
- TiTiler (raster tile service)

---

## Local Development

Clone the repo and install dependencies:

    npm install

Run the development server:

    npm run dev

Build for production:

    npm run build

---

## Configuration Notes

Before running, ensure:

- TiTiler base URL is set to a public endpoint (not localhost)
- S3 data paths are accessible
- CORS is configured properly for S3 and TiTiler

Example:

    const TITILER_BASE_URL = "http://your-ec2-url"

---

## Deployment

This app is designed to be deployed via AWS Amplify:

- Connect this repo to Amplify Hosting
- Amplify will automatically:
  - install dependencies
  - build the app
  - deploy to a CDN

---

## Project Structure

    src/
      components/     # UI components (Map, Sidebar, Panels)
      assets/         # Icons and images
      config/         # Layer configurations
      data/           # Mock or static data

---

## Notes

- `node_modules` is excluded via `.gitignore`
- Build artifacts (`dist/` or `build/`) are not committed
- All data is served externally (S3 / APIs)

---

## License

MIT License
