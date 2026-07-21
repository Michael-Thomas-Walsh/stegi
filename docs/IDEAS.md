# Six starter project ideas

All of these: fun, visual, planner/architect-flavored, and buildable in
TypeScript + HTML + CSS with no libraries, no API keys, no data files.
Pick one, or let one of them mutate into your own idea.

## 1. Sun & Shadow Toy 🌇

A few simple building rectangles on a street. A slider moves the sun across
the sky (6:00 → 20:00); shadows stretch, swing, and shrink in real time.
Bonus: a "shadow on the café terrace?" warning.
_Core mechanic: one slider + CSS/canvas transforms._

## 2. Tiny Block City 🏘️

A clickable grid. Each click cycles a cell: empty → house → tower → park.
Live counters on top: population, green ratio, density score.
_Core mechanic: click grid cells, recount, recolor._

## 3. Facade Generator 🏢

Sliders for floors, window columns, window size, and a color palette button
generate a building facade as SVG. A "randomize" button makes endless
variants. Bonus: download as image.
_Core mechanic: sliders → redraw an SVG grid._

## 4. Before / After Street 🚲

Two versions of the same street scene (car-dominated vs. greened/bike lane),
drawn with simple colored shapes. A draggable divider wipes between them.
_Core mechanic: two layered divs + one draggable handle._

## 5. 15-Minute Neighborhood 📍

A neighborhood plan (plain colored rectangles). Click to place your home,
then place a bakery, school, park. The app draws walking circles and scores
how "15-minute" your life is.
_Core mechanic: click to place points, distance math, a score dial._

## 6. Density Explorer 🏙️

Three sliders — floors, footprint, spacing — redraw a block of simple 3D-ish
buildings (CSS transforms) and update live numbers: floor area ratio, units,
estimated residents.
_Core mechanic: sliders → redraw boxes + recompute three numbers._
