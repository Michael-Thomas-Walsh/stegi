# STÉGI — The Invisible City

A rooftop-greening tool for a cooler Athens.

Athens is short on green space and heavy on urban heat — while thousands of
flat rooftops sit bare and hot. **STÉGI** reads those rooftops from map
data, groups them into typologies with machine learning, turns each into a
green space (a **park** or a **garden**), and puts a number on the payoff:
how much a neighbourhood is cooled (°C) and what it costs (€) — so a city
can see where to spend first.

Everything runs in your browser. No backend, no accounts, no API keys.

> ⚠️ The cooling and cost figures are **illustrative estimates** for a
> workshop prototype, not certified engineering numbers. OpenStreetMap has
> no reliable building-height data, so everything downstream is an
> approximation.

## What it does

1. **Draw an area** — drag a box over a neighbourhood on the map.
2. **Detect rooftops** — fetches real building footprints from
   OpenStreetMap (Overpass API) and keeps the ones big enough to matter.
3. **Cluster them** — a hand-written k-means groups roofs by size, shape,
   density, and distance to existing green.
4. **Assign a green type** — the biggest, densest, greenery-starved cluster
   becomes **PARK**; the rest become **GARDEN**.
5. **Cost it out** — each roof gets a cooling (°C) and cost (€) estimate,
   and roofs are ranked by cost-effectiveness (€ per °C).
6. **See before → after** — the map colours roofs by green type, with a
   toggle back to the grey "before" state, a live tally, and click-a-roof
   details.

## Run it locally

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Then open the URL it prints (usually http://localhost:5173) and drag a box
anywhere in Athens.

To make a production build:

```bash
npm run build     # outputs to dist/
npm run preview   # serve the built version locally
```

## How it's built

Three languages, no frameworks — plus two mapping libraries.

| Area | Tech |
|---|---|
| Structure | HTML (`index.html`) |
| Appearance | CSS (`src/style.css`) |
| Behaviour | TypeScript (`src/*.ts`) |
| Map | [Leaflet](https://leafletjs.com) |
| Geometry | [Turf.js](https://turfjs.org) |
| Rooftop data | [OpenStreetMap](https://www.openstreetmap.org) via the Overpass API |

The code is split into small, single-job files: `map.ts` (the map + drawing),
`osm.ts` (fetching data), `features.ts` (turning roofs into numbers),
`cluster.ts` (k-means), `greenType.ts` (PARK/GARDEN rules), `cooling.ts`
(the °C/€ maths), and `sidebar.ts` (the list + details).

## Documentation

The `docs/` folder holds the thinking behind the app:

- `docs/plan/` — the plan from the user's point of view: the PRD and user
  stories.
- `docs/architecture.md` — how the app actually works (files, data flow,
  decisions).
- `docs/frontend.md` — layout, colours, and interactions.

## Credits

Built at the GSS26 workshop as a first project, with an AI coding agent,
from the [vibecoding-starter](https://github.com/Infrared-city/vibecoding-starter)
template.
