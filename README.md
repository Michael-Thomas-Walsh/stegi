# STÉGI — The Invisible City

**Athens, but make it cooler.**

STÉGI is a browser-based rooftop analysis tool for Greater Athens. It lets a user find a site, define and confirm a study boundary, retrieve building footprints, inspect relative building heights, group rooftops into typologies, and test indicative greening and cooling strategies.

> **Prototype notice:** cooling, cost and machine-learning-derived building-height values are indicative. They are not surveyed or certified engineering data.

## Current workflow

1. Search for an address within Greater Athens.
2. Define a boundary by drawing a rectangle, drawing a polygon, or uploading a zipped shapefile.
3. Confirm the boundary.
4. Detect OpenStreetMap building footprints.
5. Read explicit OSM heights and levels where available.
6. Enrich missing values with GlobalBuildingAtlas height data.
7. Display greening, relative building height, or height-data confidence.
8. Review rooftop groups, indicative cooling and indicative cost results.

## Requirements

- **Node.js 22.12 or newer**
- npm, included with Node.js
- A current Chromium-based browser such as Chrome or Edge
- An internet connection for maps, geocoding, OSM and GlobalBuildingAtlas queries

Detailed package and troubleshooting notes are in [DEPENDENCIES.md](DEPENDENCIES.md).

## Install

Clone or download the project, open its root folder in Visual Studio Code, and run:

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite, normally:

```text
http://localhost:5173/
```

## Required npm packages

A normal `npm install` should install everything recorded in `package.json`.

The application currently relies on these runtime packages:

```text
@duckdb/node-api             1.5.4-r.1
@maplibre/maplibre-gl-leaflet 0.1.3
@turf/turf
leaflet
maplibre-gl                  5.24.0
shpjs                        6.2.0
```

Development packages include:

```text
@types/leaflet
typescript
vite
```

To repair a local installation where one or more dependencies are missing:

```powershell
npm install @duckdb/node-api@1.5.4-r.1 `
  @maplibre/maplibre-gl-leaflet@0.1.3 `
  @turf/turf `
  leaflet `
  maplibre-gl@5.24.0 `
  shpjs@6.2.0

npm install --save-dev @types/leaflet typescript vite
```

Do not request `@duckdb/node-api@^1.5.4`; that exact semantic-version target does not exist. Use:

```powershell
npm install @duckdb/node-api@1.5.4-r.1
```

## Clean reinstall

Use this when Vite reports an unresolved package even though it appears in `package.json`:

```powershell
Ctrl + C

Remove-Item -Recurse -Force node_modules
Remove-Item -Recurse -Force "node_modules\.vite-temp" -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue

npm install
npm run dev
```

Normally, keep `package-lock.json`. Delete it only when repairing a broken or incompatible dependency installation.

## Build and preview

```powershell
npm run build
npm run preview
```

The production build is written to:

```text
dist/
```

## Runtime data services

STÉGI uses external services and datasets at runtime:

- **Nominatim** for address search
- **OpenStreetMap Overpass** for building footprints and tags
- **MapLibre/OpenFreeMap map tiles** for the vector basemap
- **GlobalBuildingAtlas LoD1** for machine-learning-derived building heights
- **Microsoft Global ML Building Footprints**, where retained as a secondary fallback

The first GlobalBuildingAtlas request can take longer because DuckDB may initialise its `httpfs` and `spatial` extensions and query a remote Parquet tile. Those extensions are loaded by the application and are not separate npm packages.

## Building-height hierarchy

STÉGI prioritises height data in this order:

1. Explicit OSM `height`
2. OSM `building:levels`, converted to an indicative height
3. GlobalBuildingAtlas footprint containing the OSM building centroid
4. Additional overlap and positional matching
5. Microsoft-derived height, where enabled
6. Optional neighbourhood estimate for unresolved buildings

The displayed value is **relative roof height above local ground**, not absolute elevation above sea level.

## Troubleshooting

### `crypto.hash is not a function`

Your Node.js version is too old for the installed Vite version.

```powershell
node --version
```

Install Node.js 22.12 or newer, fully close VS Code, then reopen the project.

### `ERR_MODULE_NOT_FOUND: @duckdb/node-api`

```powershell
npm install @duckdb/node-api@1.5.4-r.1
Remove-Item -Recurse -Force "node_modules\.vite-temp" -ErrorAction SilentlyContinue
npm run dev
```

### `ETARGET No matching version found for @duckdb/node-api@^1.5.4`

Remove or replace the invalid version in `package.json`:

```powershell
npm pkg set "dependencies.@duckdb/node-api=1.5.4-r.1"
npm install
```

### Check installed versions

```powershell
node --version
npm --version
npm list --depth=0
```

### Clear the GlobalBuildingAtlas query cache

Use this only when testing a revised GBA query or matching method:

```powershell
Remove-Item -Recurse -Force "$env:TEMP\stegi-gba-height-cache-v2" -ErrorAction SilentlyContinue
```

Then restart Vite.

## Main technologies

| Area | Technology |
|---|---|
| Structure | HTML |
| Styling | CSS |
| Application logic | TypeScript |
| Development server/build | Vite |
| Interactive 2D map | Leaflet |
| Vector basemap | MapLibre GL through the Leaflet adapter |
| Geometry operations | Turf.js |
| Shapefile input | Shapefile.js (`shpjs`) |
| Remote analytical queries | DuckDB Node API |
| Building footprints | OpenStreetMap |
| Height enrichment | GlobalBuildingAtlas |

## Data and licensing note

Check the licence and attribution requirements of every external dataset before public deployment or commercial use. GlobalBuildingAtlas height data should remain visibly identified as model-derived rather than surveyed data.
