// Everything to do with the Leaflet map: the base streets, letting the user
// drag a rectangle to pick an area, and drawing the detected rooftops
// (colour-coded, with click-to-select that stays in sync with the sidebar).

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Rooftop } from './state'
import { state } from './state'
import { COLORS } from './constants'

const ATHENS_CENTER: L.LatLngExpression = [37.9838, 23.7275]
const START_ZOOM = 15
const MIN_BOX_METRES = 40 // ignore tiny accidental drags

let map: L.Map
let boundaryShape: L.Rectangle | null = null // the chosen area
let rectPreview: L.Rectangle | null = null // the box while dragging
const roofLayers = new Map<number, L.Polygon>() // rooftop id → its polygon

// Are we currently in "drag a box" mode?
let drawing = false
let dragStart: L.LatLng | null = null

// Callbacks back to main.ts.
let onBoundaryDone: (() => void) | null = null
let onDrawModeChange: ((active: boolean) => void) | null = null
let onRoofClick: ((id: number) => void) | null = null

export function createMap(containerId: string): L.Map {
  map = L.map(containerId).setView(ATHENS_CENTER, START_ZOOM)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map)

  // While in draw mode, a press-drag-release draws the selection box.
  // (Map panning is turned off during draw mode so the drag draws instead.)
  map.on('mousedown', (e: L.LeafletMouseEvent) => {
    if (!drawing) return
    dragStart = e.latlng
  })
  map.on('mousemove', (e: L.LeafletMouseEvent) => {
    if (!drawing || !dragStart) return
    const bounds = L.latLngBounds(dragStart, e.latlng)
    if (rectPreview) rectPreview.setBounds(bounds)
    else
      rectPreview = L.rectangle(bounds, {
        color: COLORS.SELECTED,
        weight: 2,
        dashArray: '4 4',
        fillOpacity: 0,
      }).addTo(map)
  })
  map.on('mouseup', (e: L.LeafletMouseEvent) => {
    if (!drawing || !dragStart) return
    finalizeBox(L.latLngBounds(dragStart, e.latlng))
    dragStart = null
  })

  return map
}

export function onBoundaryFinished(cb: () => void) {
  onBoundaryDone = cb
}
export function onDrawModeChanged(cb: (active: boolean) => void) {
  onDrawModeChange = cb
}
export function onRooftopClick(cb: (id: number) => void) {
  onRoofClick = cb
}

// Enter "drag a box" mode: crosshair cursor, panning off.
export function startDrawMode() {
  drawing = true
  map.dragging.disable()
  map.getContainer().style.cursor = 'crosshair'
  onDrawModeChange?.(true)
}

function endDrawMode() {
  drawing = false
  map.dragging.enable()
  map.getContainer().style.cursor = ''
  onDrawModeChange?.(false)
}

// Turn the dragged box into the chosen boundary (unless it's too small).
function finalizeBox(bounds: L.LatLngBounds) {
  const diagonal = bounds.getNorthEast().distanceTo(bounds.getSouthWest())
  if (diagonal < MIN_BOX_METRES) {
    rectPreview?.remove()
    rectPreview = null
    return // treat as an accidental click — stay in draw mode
  }

  rectPreview?.remove()
  rectPreview = null
  boundaryShape?.remove()
  boundaryShape = L.rectangle(bounds, {
    color: COLORS.SELECTED,
    weight: 2,
    fillOpacity: 0,
  }).addTo(map)

  // Store the four corners as [lat, lng] for the Overpass query.
  const sw = bounds.getSouthWest()
  const ne = bounds.getNorthEast()
  state.boundary = [
    [sw.lat, sw.lng],
    [sw.lat, ne.lng],
    [ne.lat, ne.lng],
    [ne.lat, sw.lng],
  ]

  map.fitBounds(bounds)
  endDrawMode()
  onBoundaryDone?.()
}

// Wipe the boundary and all rooftops so the user can start over.
export function clearMap() {
  rectPreview?.remove()
  boundaryShape?.remove()
  rectPreview = null
  boundaryShape = null
  roofLayers.forEach((layer) => layer.remove())
  roofLayers.clear()
}

// Draw the detected rooftops. Called once after detection.
export function drawRooftops(rooftops: Rooftop[]) {
  roofLayers.forEach((layer) => layer.remove())
  roofLayers.clear()

  for (const r of rooftops) {
    // GeoJSON is [lon, lat]; Leaflet wants [lat, lng].
    const latlngs = r.polygon.geometry.coordinates[0].map(
      ([lon, lat]) => [lat, lon] as [number, number],
    )
    const layer = L.polygon(latlngs, roofStyle(r)).addTo(map)
    layer.on('click', () => onRoofClick?.(r.id))
    roofLayers.set(r.id, layer)
  }
}

// Colour for a roof, respecting the before/after toggle and the filter.
function roofStyle(r: Rooftop): L.PathOptions {
  const fill = state.showAfter ? COLORS[r.greenType] : COLORS.BEFORE
  const selected = r.id === state.selectedId
  const matches =
    state.filter === '' ||
    r.greenType.toLowerCase().includes(state.filter.toLowerCase())
  return {
    color: selected ? COLORS.SELECTED : fill,
    weight: selected ? 3 : 1,
    fillColor: fill,
    fillOpacity: matches ? 0.7 : 0.15,
    opacity: matches ? 1 : 0.3,
  }
}

// Re-style rooftops without rebuilding them (used on select / toggle / filter).
export function restyleRooftops(rooftops: Rooftop[]) {
  for (const r of rooftops) {
    roofLayers.get(r.id)?.setStyle(roofStyle(r))
  }
}
