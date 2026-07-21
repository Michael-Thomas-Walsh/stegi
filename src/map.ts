// Everything to do with the Leaflet map: the base streets, selecting an area,
// navigating to an address, displaying an uploaded boundary and drawing the
// detected rooftops.

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Rooftop } from './state'
import { state } from './state'
import { COLORS } from './constants'
import {
  ATHENS_CENTER,
  ATHENS_STUDY_BOUNDS,
  type LatLngTuple,
  validateAthensBoundary,
} from './athens'

const START_ZOOM = 15
const MIN_BOX_METRES = 40

let map: L.Map
let boundaryShape: L.Polygon | null = null
let rectPreview: L.Rectangle | null = null
let locationMarker: L.CircleMarker | null = null
const roofLayers = new Map<number, L.Polygon>()

let drawing = false
let dragStart: L.LatLng | null = null

let onBoundaryDone: (() => void) | null = null
let onBoundaryReject: ((message: string) => void) | null = null
let onDrawModeChange: ((active: boolean) => void) | null = null
let onRoofClick: ((id: number) => void) | null = null

export function createMap(containerId: string): L.Map {
  const allowedBounds = L.latLngBounds(
    [ATHENS_STUDY_BOUNDS.south, ATHENS_STUDY_BOUNDS.west],
    [ATHENS_STUDY_BOUNDS.north, ATHENS_STUDY_BOUNDS.east],
  )

  map = L.map(containerId, {
    maxBounds: allowedBounds.pad(0.08),
    maxBoundsViscosity: 1,
    minZoom: 12,
  }).setView(ATHENS_CENTER, START_ZOOM)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map)

  map.on('mousedown', (event: L.LeafletMouseEvent) => {
    if (!drawing) return
    dragStart = event.latlng
  })

  map.on('mousemove', (event: L.LeafletMouseEvent) => {
    if (!drawing || !dragStart) return

    const bounds = L.latLngBounds(dragStart, event.latlng)
    if (rectPreview) {
      rectPreview.setBounds(bounds)
    } else {
      rectPreview = L.rectangle(bounds, {
        color: COLORS.SELECTED,
        weight: 2,
        dashArray: '4 4',
        fillOpacity: 0,
      }).addTo(map)
    }
  })

  map.on('mouseup', (event: L.LeafletMouseEvent) => {
    if (!drawing || !dragStart) return
    finaliseBox(L.latLngBounds(dragStart, event.latlng))
    dragStart = null
  })

  return map
}

export function onBoundaryFinished(callback: () => void): void {
  onBoundaryDone = callback
}

export function onBoundaryRejected(
  callback: (message: string) => void,
): void {
  onBoundaryReject = callback
}

export function onDrawModeChanged(
  callback: (active: boolean) => void,
): void {
  onDrawModeChange = callback
}

export function onRooftopClick(callback: (id: number) => void): void {
  onRoofClick = callback
}

export function startDrawMode(): void {
  drawing = true
  map.dragging.disable()
  map.getContainer().style.cursor = 'crosshair'
  onDrawModeChange?.(true)
}

function endDrawMode(): void {
  drawing = false
  dragStart = null
  map.dragging.enable()
  map.getContainer().style.cursor = ''
  onDrawModeChange?.(false)
}

function finaliseBox(bounds: L.LatLngBounds): void {
  const diagonal = bounds
    .getNorthEast()
    .distanceTo(bounds.getSouthWest())

  if (diagonal < MIN_BOX_METRES) {
    rectPreview?.remove()
    rectPreview = null
    return
  }

  const southWest = bounds.getSouthWest()
  const northEast = bounds.getNorthEast()
  const boundary: LatLngTuple[] = [
    [southWest.lat, southWest.lng],
    [southWest.lat, northEast.lng],
    [northEast.lat, northEast.lng],
    [northEast.lat, southWest.lng],
  ]

  const validationError = validateAthensBoundary(boundary)
  if (validationError) {
    rectPreview?.remove()
    rectPreview = null
    onBoundaryReject?.(validationError)
    return
  }

  setBoundaryFromCoordinates(boundary)
}

export function setBoundaryFromCoordinates(
  boundary: LatLngTuple[],
): void {
  const validationError = validateAthensBoundary(boundary)
  if (validationError) throw new Error(validationError)

  rectPreview?.remove()
  boundaryShape?.remove()
  rectPreview = null

  state.boundary = boundary
  boundaryShape = L.polygon(boundary, {
    color: COLORS.SELECTED,
    weight: 2,
    fillOpacity: 0.04,
  }).addTo(map)

  map.fitBounds(boundaryShape.getBounds(), { padding: [28, 28] })
  endDrawMode()
  onBoundaryDone?.()
}

export function goToLocation(
  lat: number,
  lng: number,
  label: string,
): void {
  locationMarker?.remove()
  locationMarker = L.circleMarker([lat, lng], {
    radius: 7,
    color: COLORS.SELECTED,
    weight: 2,
    fillColor: '#ffffff',
    fillOpacity: 1,
  }).addTo(map)

  locationMarker.bindTooltip(label, { direction: 'top' }).openTooltip()
  map.flyTo([lat, lng], 18, { duration: 0.8 })
}

export function clearMap(): void {
  rectPreview?.remove()
  boundaryShape?.remove()
  locationMarker?.remove()
  rectPreview = null
  boundaryShape = null
  locationMarker = null

  roofLayers.forEach((layer) => layer.remove())
  roofLayers.clear()
}

export function drawRooftops(rooftops: Rooftop[]): void {
  roofLayers.forEach((layer) => layer.remove())
  roofLayers.clear()

  for (const rooftop of rooftops) {
    const polygon = rooftop.polygon as GeoJSON.Feature<GeoJSON.Polygon>
    const latlngs = polygon.geometry.coordinates[0].map(
      ([lng, lat]) => [lat, lng] as LatLngTuple,
    )

    const layer = L.polygon(latlngs, roofStyle(rooftop)).addTo(map)
    layer.on('click', () => onRoofClick?.(rooftop.id))
    roofLayers.set(rooftop.id, layer)
  }
}

function roofStyle(rooftop: Rooftop): L.PathOptions {
  const fill = state.showAfter
    ? COLORS[rooftop.greenType]
    : COLORS.BEFORE
  const selected = rooftop.id === state.selectedId
  const matches =
    state.filter === '' ||
    rooftop.greenType.toLowerCase().includes(state.filter.toLowerCase())

  return {
    color: selected ? COLORS.SELECTED : fill,
    weight: selected ? 3 : 1,
    fillColor: fill,
    fillOpacity: matches ? 0.7 : 0.15,
    opacity: matches ? 1 : 0.3,
  }
}

export function restyleRooftops(rooftops: Rooftop[]): void {
  for (const rooftop of rooftops) {
    roofLayers.get(rooftop.id)?.setStyle(roofStyle(rooftop))
  }
}
