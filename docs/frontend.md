# Frontend

The look and feel of STÉGI, matching the sketch in `docs/plan/`.

## Layout

Two panes, full height, side by side:

- **Left sidebar** (fixed width, ~320px), top to bottom: the title, the
  control buttons (Draw area · Detect rooftops · Show: After/Before ·
  Clear), a search/filter input, the live tally, the detail panel for the
  selected rooftop, then the scrollable rooftop list. Each list row shows a
  short label (green type · area · °C · €). Selecting a roof (row or map)
  fills the detail panel — kept above the list so it's visible without
  scrolling — and scrolls it into view.
- **Right pane** (fills the rest) — the map, edge to edge.

The sidebar list is empty until rooftops are detected — before that it
just shows a hint ("draw a boundary on the map to begin").

## States (one screen, not separate pages)

0. **Draw mode (on load)** — the "Draw area" button glows dark and the hint
   reads "Drag a box across the map to pick your neighbourhood." The map
   cursor is a crosshair and panning is paused so the drag draws a box.
1. **Before detection** — map shows only the street network and the
   rectangle the user drew. Sidebar list is empty.
2. **After detection** — the same map now shows rooftop markers on top of
   the streets, colour-coded by green type. Sidebar list fills in, and the
   live tally (green m² · total °C · total € · €/°C) appears above the
   list.

## Colors

A small, fixed palette — plain HTML/CSS, no theming system:

- **Streets / basemap** — muted grey (`#c9c9c9` lines on `#f7f7f5`
  background), stays neutral so rooftop colours stand out.
- **PARK** — dark green (`#1b5e20`) — intensive, higher cooling.
- **GARDEN** — light green (`#8bc34a`) — lighter, easy to spread widely.
- **No change / below cutoff** — neutral grey (`#9e9e9e`).
- **Selected rooftop** — a thin dark outline (`#212121`) added on top of
  its green-type colour, on both the map marker and the sidebar row.
- **Text / UI chrome** — near-black (`#212121`) on white sidebar
  background (`#ffffff`).

## Interaction patterns

- **Draw area**: user drags a rectangle across the map; releasing the
  mouse sets the boundary and the map fits to it. The app starts in this
  mode; "Draw area" (or "Clear") re-enters it to pick a different area.
- **Detect**: the "Detect rooftops" button runs fetch → features →
  cluster → assign → cost, then reveals the rooftop shapes and fills the
  sidebar list and tally.
- **Search/filter**: typing in the sidebar search narrows the rooftop list
  (and dims non-matching markers on the map).
- **Select a rooftop**: click a marker on the map OR a row in the sidebar
  — both stay in sync, and the detail panel updates to that rooftop's
  stats.
- **Live tally**: recalculates automatically whenever the visible set of
  rooftops changes (e.g. after filtering).
