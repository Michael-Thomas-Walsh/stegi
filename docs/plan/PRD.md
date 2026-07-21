# PRD — STÉGI: The Invisible City

A rooftop-greening tool for a cooler Athens.

## 1. What is it?

A web app that reads Athens' flat rooftops from map data, clusters them into
typologies with machine learning, turns each into a green space (park or
garden), and calculates how much the neighbourhood is cooled (°C) and what
it costs (€).

## 2. Who is it for?

- **Urban planners / municipal officials** — see, in 30 seconds, which
  rooftops in a neighbourhood are worth greening first and why.
- **Architects and design studios** — explore rooftop potential for a site
  before proposing a design.
- **Residents and community groups** — check whether their own roof (or
  block) could become a park or garden, and roughly what it would cost.

## 3. Core features

This is a 3-day workshop MVP (GSS26), not a beginner hello-world — it has
more than the usual 3-feature cap, but the list below is already the build
order: each step only makes sense once the one before it exists.

1. **Map interface & neighbourhood selection** — interactive map of Athens
   (Leaflet); user picks a neighbourhood boundary or draws a polygon; map
   centers on the selection.
2. **Rooftop detection** — fetch OpenStreetMap building footprints for the
   selected area; treat each footprint as a candidate flat rooftop; filter
   out roofs too small to be useful.
3. **Feature vector generation** — turn every rooftop into a row of numbers:
   area, aspect ratio, orientation, sun/shade exposure (estimated from
   orientation + nearby building heights), local building density, distance
   to the nearest existing green space, and a simple heat proxy.
4. **Clustering (the ML core)** — group all rooftops into typologies;
   output a cluster assignment and cluster centroids per roof.
5. **Green-type assignment** — map each cluster + its context to one of two
   green forms:
   - **PARK** — accessible public green, intensive planting. Large roofs in
     dense areas far from existing parks. Higher cooling, higher cost.
   - **GARDEN** — communal/productive green, lighter planting. Medium
     residential roofs. Lower cost, easy to spread widely.
6. **Cooling & cost calculation** — for each greened roof: temperature
   reduction (°C, scaled by area and green type using published green-roof
   cooling coefficients) and cost (€ = area × cost-per-m² for its green
   type); derive €/°C per roof and per neighbourhood; allow ranking roofs
   by €/°C.
7. **Before → After visualisation** — map coloured by green type (two
   greens + neutral for "no change"); before/after slider; live tally of
   green m², total °C cooling, total € cost, €/°C; click a roof to see its
   features, green type, cooling, and cost.

**Allowed dependencies (exception to the no-extra-packages rule):**
Leaflet (map rendering) and Turf.js (geometry: area, distance, orientation,
buffers). No other frameworks or libraries. No API keys — OSM data comes
from the free, keyless Overpass API. No accounts, no database; everything
runs client-side in the browser.

## 4. Explicitly NOT in v1

- Full city-wide coverage — one Athens neighbourhood only, as
  proof-of-concept.
- Real building-height data (OSM rarely has it) — height is estimated from
  `building:levels` where tagged, otherwise a default assumption. Cooling
  and cost numbers are illustrative estimates, not certified figures.
- User accounts, saved projects, or sharing/exporting reports.
- Editing or correcting OSM data from within the app.
- Any planting/construction scheduling, permitting, or procurement.

## 5. Done means…

I can draw a neighbourhood boundary on the map, see its rooftops detected
and clustered, see each one assigned PARK or GARDEN with a before/after
view, and see live totals for green m², °C cooling, € cost, and €/°C for
the whole selection.
