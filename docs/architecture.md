# Architecture

How STÉGI actually works. No backend, no database — everything runs in the
browser. Update this file every time the app's structure changes.

## Files

| File | What it does |
|---|---|
| `index.html` | page shell: sidebar (search + rooftop list) and map container |
| `src/main.ts` | wires everything together: map → detect → cluster → assign → cost → render |
| `src/state.ts` | the app's one shared state object (boundary, rooftops, selected rooftop) |
| `src/map.ts` | Leaflet setup, draws the neighbourhood boundary, renders rooftop markers |
| `src/osm.ts` | fetches building footprints for the boundary from the Overpass API |
| `src/features.ts` | turns each footprint into a feature vector (area, orientation, density, etc.) using Turf.js |
| `src/cluster.ts` | hand-written k-means — groups rooftops into typologies |
| `src/greenType.ts` | rule layer: cluster + context → PARK or GARDEN |
| `src/cooling.ts` | cooling (°C) and cost (€) formulas, using constants from `src/constants.ts` |
| `src/constants.ts` | cooling coefficients and cost-per-m², labelled as illustrative estimates |
| `src/sidebar.ts` | renders the searchable rooftop list and the click-to-inspect detail panel |
| `src/style.css` | layout and colors |

If any file passes ~200 lines, split it — don't let one file do two jobs.

## Data flow

1. The app opens in "draw mode": the user drags a rectangle across the map
   to pick a neighbourhood (releasing the mouse finishes it — no separate
   step). Map shows streets only — no rooftops yet.
2. User clicks "Detect rooftops". `main.ts` calls `osm.ts` to fetch
   building footprints + existing green spaces inside the boundary
   (Overpass API, no key, called directly from the browser; it tries
   several public Overpass servers in turn so one busy server — a 504 —
   doesn't break detection).
3. Footprints below the minimum-size cutoff are dropped.
4. `features.ts` computes a feature vector per rooftop.
5. `cluster.ts` groups rooftops into clusters from those vectors.
6. `greenType.ts` turns each cluster + roof context into PARK or GARDEN.
7. `cooling.ts` computes € cost (area × cost-per-m²) and °C cooling
   (area × cooling-per-m² × a context factor) per roof. The context factor
   is higher for hotter, greener-starved roofs, so €/°C varies per roof —
   which is what makes ranking by cost-effectiveness meaningful.
8. `map.ts` redraws: rooftop markers appear, colour-coded by green type.
   `sidebar.ts` renders the rooftop list and the live tally (total m²,
   °C, €, €/°C). Clicking a marker or a list row selects the same rooftop
   in both places and opens its detail panel.

State only flows one way: boundary → rooftops → features → clusters →
green type → cooling/cost → screen. Nothing is written back upstream.

## Decisions

- **No backend, no accounts, no database** — the whole pipeline (fetch,
  cluster, calculate) runs client-side on each page load.
- **Overpass API, keyless** — avoids needing any API key or account.
- **k-means hand-written in TypeScript** — no ML library needed for a
  clustering algorithm this simple.
- **Leaflet + Turf.js are the only allowed dependencies** — named
  explicitly in `docs/plan/PRD.md`; everything else is plain TS/HTML/CSS.
- **Cooling/cost constants are illustrative, not certified** — OSM lacks
  reliable building-height data, so estimates are clearly labelled as
  approximate in the UI, not presented as scientific fact.
- **Single neighbourhood scope** — no city-wide data loading, keeping
  Overpass queries small and fast for a 3-day build.
- **Drag-a-rectangle, not a free-form polygon** — a box has a natural end
  (mouse release), so there's no "finish" step to explain; the app also
  starts in draw mode so the first action is obvious. Trade-off: you can't
  trace an irregular boundary, which is fine for "pick an area".
- **Cooling scaled by context, not just area** — a flat area × coefficient
  gives every roof the same €/°C, making the "rank by €/°C" feature
  pointless; the heat/greenery context factor fixes that.
