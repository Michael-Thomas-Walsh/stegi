# STÉGI dependencies and installation

This document records the software, npm packages and online services required by the current STÉGI development version.

## 1. System software

### Required

- Windows 10/11, macOS or Linux
- Node.js **22.12 or newer**
- npm, installed with Node.js
- Visual Studio Code or another code editor
- Chrome, Edge or another modern browser
- Internet access

Confirm the local versions:

```powershell
node --version
npm --version
```

## 2. One-command installation

From the project root:

```powershell
npm install
npm run dev
```

`npm install` reads `package.json` and `package-lock.json`. Nobody should normally have to install each package manually.

## 3. Runtime npm dependencies

| Package | Purpose | Recommended version |
|---|---|---:|
| `@duckdb/node-api` | Queries cloud-hosted GlobalBuildingAtlas Parquet data from the Vite-side service | `1.5.4-r.1` |
| `@maplibre/maplibre-gl-leaflet` | Connects MapLibre GL to the existing Leaflet map | `0.1.3` |
| `@turf/turf` | Polygon, centroid, intersection, buffer and spatial calculations | project lockfile |
| `leaflet` | Main interactive map and drawn layers | project lockfile |
| `maplibre-gl` | Custom vector basemap rendering | `5.24.0` |
| `shpjs` | Reads zipped shapefiles in the browser | `6.2.0` |

Manual repair command:

```powershell
npm install @duckdb/node-api@1.5.4-r.1 `
  @maplibre/maplibre-gl-leaflet@0.1.3 `
  @turf/turf `
  leaflet `
  maplibre-gl@5.24.0 `
  shpjs@6.2.0
```

## 4. Development dependencies

| Package | Purpose |
|---|---|
| `@types/leaflet` | TypeScript declarations for Leaflet |
| `typescript` | Type checking and compilation |
| `vite` | Local development server, proxy/service middleware and production build |

Manual repair command:

```powershell
npm install --save-dev @types/leaflet typescript vite
```

## 5. DuckDB version warning

The valid package version used by this project is:

```text
@duckdb/node-api@1.5.4-r.1
```

This will fail:

```text
@duckdb/node-api@^1.5.4
```

because npm does not contain a matching plain `1.5.4` release.

Use:

```powershell
npm pkg set "dependencies.@duckdb/node-api=1.5.4-r.1"
npm install
```

The package provides prebuilt Windows x64 and ARM64 binaries, so a separate local C++ compiler or Python installation should not normally be required.

## 6. DuckDB extensions

The application uses DuckDB extensions such as:

```text
httpfs
spatial
```

They support remote Parquet access and spatial querying. They are loaded by DuckDB at runtime and should not be added as npm dependencies.

The first height query can therefore be slower and needs internet access.

## 7. External runtime services

| Service or dataset | Use |
|---|---|
| Nominatim | Address search |
| OpenStreetMap Overpass | Building footprint and tag download |
| OpenFreeMap/MapLibre tiles | Custom vector basemap |
| GlobalBuildingAtlas LoD1 | Building polygons and predicted heights |
| Microsoft Global ML Building Footprints | Optional secondary height fallback |

These are online dependencies: `npm install` does not download their datasets locally.

## 8. Clean installation

```powershell
Ctrl + C
cd D:\stegi

Remove-Item -Recurse -Force node_modules
Remove-Item -Recurse -Force "node_modules\.vite-temp" -ErrorAction SilentlyContinue
npm install
npm run dev
```

Keep `package-lock.json` unless it is itself broken or references an invalid package version.

## 9. Full dependency check

```powershell
npm list --depth=0
```

The output should include the runtime and development packages listed above.

To check the DuckDB package specifically:

```powershell
npm list @duckdb/node-api
```

Expected:

```text
@duckdb/node-api@1.5.4-r.1
```

## 10. Common errors

### Vite cannot resolve `maplibre-gl`

```powershell
npm install maplibre-gl@5.24.0 @maplibre/maplibre-gl-leaflet@0.1.3
npm run dev
```

### Vite cannot resolve `@duckdb/node-api`

```powershell
npm install @duckdb/node-api@1.5.4-r.1
Remove-Item -Recurse -Force "node_modules\.vite-temp" -ErrorAction SilentlyContinue
npm run dev
```

### npm returns `ETARGET`

Open `package.json` and remove invalid package requests such as:

```json
"@duckdb/node-api": "^1.5.4"
```

Replace with:

```json
"@duckdb/node-api": "1.5.4-r.1"
```

Then run:

```powershell
npm install
```

### Vite reports `crypto.hash is not a function`

Upgrade Node.js:

```powershell
node --version
```

The project requires Node.js 22.12 or newer.

## 11. Recommended project rule

Whenever a new dependency is introduced:

1. Install it with npm rather than copying library files manually.
2. Confirm it appears in `package.json`.
3. Commit both `package.json` and `package-lock.json`.
4. Add its purpose to this document.
5. Run a clean `npm install` before sharing a release.
