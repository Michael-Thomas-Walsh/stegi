// Leaflet map behaviour: address navigation, rectangle/polygon creation,
// pending-boundary confirmation and rooftop rendering.

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Rooftop } from './state'
import { state } from './state'
import { COLORS } from './constants'
import {
  confidenceColour,
  heightColour,
  heightSourceLabel,
} from './height'
import { installBasemaps } from './basemap'
import {
  ATHENS_CENTER,
  ATHENS_STUDY_BOUNDS,
  type LatLngTuple,
  validateAthensBoundary,
} from './athens'

const START_ZOOM = 15
const MIN_BOUNDARY_DIAGONAL_METRES = 40

export type DrawMode = 'rectangle' | 'polygon'
export type BoundarySource = DrawMode | 'shapefile'

let map: L.Map
let confirmedBoundaryShape: L.Polygon | null = null
let pendingBoundaryShape: L.Polygon | null = null
let pendingBoundary: LatLngTuple[] = []
let pendingBoundarySource: BoundarySource | null = null

let rectPreview: L.Rectangle | null = null
let polygonPreview: L.Polyline | null = null
let polygonPoints: LatLngTuple[] = []
let polygonVertexMarkers: L.CircleMarker[] = []
let locationMarker: L.CircleMarker | null = null
const roofLayers = new Map<number, L.Polygon>()

let drawMode: DrawMode | null = null
let rectangleStart: L.LatLng | null = null

let onBoundaryReadyCallback:
  | ((source: BoundarySource, vertexCount: number) => void)
  | null = null
let onBoundaryConfirmedCallback: (() => void) | null = null
let onBoundaryRejectCallback: ((message: string) => void) | null = null
let onDrawModeChangeCallback: ((mode: DrawMode | null) => void) | null = null
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
    zoomControl: false,
    preferCanvas: true,
  }).setView(ATHENS_CENTER, START_ZOOM)

  installBasemaps(map)

  map.on('mousedown', handleRectangleStart)
  map.on('mousemove', handleRectangleMove)
  map.on('mouseup', handleRectangleEnd)
  map.on('click', handlePolygonClick)

  return map
}

export function onBoundaryReady(
  callback: (source: BoundarySource, vertexCount: number) => void,
): void {
  onBoundaryReadyCallback = callback
}

export function onBoundaryConfirmed(callback: () => void): void {
  onBoundaryConfirmedCallback = callback
}

export function onBoundaryRejected(
  callback: (message: string) => void,
): void {
  onBoundaryRejectCallback = callback
}

export function onDrawModeChanged(
  callback: (mode: DrawMode | null) => void,
): void {
  onDrawModeChangeCallback = callback
}

export function onRooftopClick(callback: (id: number) => void): void {
  onRoofClick = callback
}

export function startRectangleMode(): void {
  cancelDrawingMode()
  removePendingBoundary()
  drawMode = 'rectangle'
  map.dragging.disable()
  map.getContainer().style.cursor = 'crosshair'
  onDrawModeChangeCallback?.(drawMode)
}

export function startPolygonMode(): void {
  cancelDrawingMode()
  removePendingBoundary()
  drawMode = 'polygon'
  polygonPoints = []
  map.dragging.enable()
  map.getContainer().style.cursor = 'crosshair'
  onDrawModeChangeCallback?.(drawMode)
}

export function finishPolygonMode(): boolean {
  if (drawMode !== 'polygon') return false

  if (polygonPoints.length < 3) {
    onBoundaryRejectCallback?.(
      'Add at least three polygon vertices before finishing the boundary.',
    )
    return false
  }

  const boundary = [...polygonPoints]
  clearPolygonPreview()
  prepareBoundary(boundary, 'polygon')
  return true
}

export function cancelDrawingMode(): void {
  rectangleStart = null
  rectPreview?.remove()
  rectPreview = null
  clearPolygonPreview()

  if (map) {
    map.dragging.enable()
    map.getContainer().style.cursor = ''
  }

  const previousMode = drawMode
  drawMode = null
  if (previousMode !== null) onDrawModeChangeCallback?.(null)
}

function handleRectangleStart(event: L.LeafletMouseEvent): void {
  if (drawMode !== 'rectangle') return
  rectangleStart = event.latlng
}

function handleRectangleMove(event: L.LeafletMouseEvent): void {
  if (drawMode !== 'rectangle' || !rectangleStart) return

  const bounds = L.latLngBounds(rectangleStart, event.latlng)
  if (rectPreview) {
    rectPreview.setBounds(bounds)
  } else {
    rectPreview = L.rectangle(bounds, {
      color: '#c26b20',
      weight: 2,
      dashArray: '7 5',
      fillColor: '#f2a65a',
      fillOpacity: 0.08,
    }).addTo(map)
  }
}

function handleRectangleEnd(event: L.LeafletMouseEvent): void {
  if (drawMode !== 'rectangle' || !rectangleStart) return

  const bounds = L.latLngBounds(rectangleStart, event.latlng)
  rectangleStart = null

  const diagonal = bounds
    .getNorthEast()
    .distanceTo(bounds.getSouthWest())

  if (diagonal < MIN_BOUNDARY_DIAGONAL_METRES) {
    rectPreview?.remove()
    rectPreview = null
    onBoundaryRejectCallback?.('The rectangle is too small. Draw a larger area.')
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

  rectPreview?.remove()
  rectPreview = null
  prepareBoundary(boundary, 'rectangle')
}

function handlePolygonClick(event: L.LeafletMouseEvent): void {
  if (drawMode !== 'polygon') return

  const point: LatLngTuple = [event.latlng.lat, event.latlng.lng]
  polygonPoints.push(point)

  const marker = L.circleMarker(point, {
    radius: 4,
    color: '#c26b20',
    weight: 2,
    fillColor: '#ffffff',
    fillOpacity: 1,
    interactive: false,
  }).addTo(map)
  polygonVertexMarkers.push(marker)

  if (!polygonPreview) {
    polygonPreview = L.polyline(polygonPoints, {
      color: '#c26b20',
      weight: 2,
      dashArray: '7 5',
    }).addTo(map)
  } else {
    polygonPreview.setLatLngs(polygonPoints)
  }
}

function clearPolygonPreview(): void {
  polygonPreview?.remove()
  polygonPreview = null
  polygonVertexMarkers.forEach((marker) => marker.remove())
  polygonVertexMarkers = []
  polygonPoints = []
}

function prepareBoundary(
  boundary: LatLngTuple[],
  source: BoundarySource,
): void {
  const validationError = validateAthensBoundary(boundary)
  if (validationError) {
    cancelDrawingMode()
    onBoundaryRejectCallback?.(validationError)
    return
  }

  const bounds = L.latLngBounds(boundary)
  const diagonal = bounds.getNorthEast().distanceTo(bounds.getSouthWest())
  if (diagonal < MIN_BOUNDARY_DIAGONAL_METRES) {
    cancelDrawingMode()
    onBoundaryRejectCallback?.('The boundary is too small. Select a larger area.')
    return
  }

  removeConfirmedBoundary()
  removePendingBoundary()
  clearRooftops()
  state.boundary = []

  pendingBoundary = boundary.map(([lat, lng]) => [lat, lng])
  pendingBoundarySource = source
  pendingBoundaryShape = L.polygon(pendingBoundary, {
    color: '#c26b20',
    weight: 2,
    dashArray: '7 5',
    fillColor: '#f2a65a',
    fillOpacity: 0.08,
  }).addTo(map)

  map.fitBounds(pendingBoundaryShape.getBounds(), { padding: [28, 28] })
  cancelDrawingMode()
  onBoundaryReadyCallback?.(source, pendingBoundary.length)
}

export function setPendingBoundaryFromCoordinates(
  boundary: LatLngTuple[],
  source: BoundarySource = 'shapefile',
): void {
  cancelDrawingMode()
  prepareBoundary(boundary, source)
}

export function confirmPendingBoundary(): boolean {
  if (!pendingBoundaryShape || pendingBoundary.length < 3) return false

  removeConfirmedBoundary()
  state.boundary = pendingBoundary.map(([lat, lng]) => [lat, lng])
  confirmedBoundaryShape = pendingBoundaryShape
  confirmedBoundaryShape.setStyle({
    color: COLORS.SELECTED,
    weight: 3,
    dashArray: '',
    fillColor: COLORS.SELECTED,
    fillOpacity: 0.04,
  })

  pendingBoundaryShape = null
  pendingBoundary = []
  pendingBoundarySource = null
  onBoundaryConfirmedCallback?.()
  return true
}

function removePendingBoundary(): void {
  pendingBoundaryShape?.remove()
  pendingBoundaryShape = null
  pendingBoundary = []
  pendingBoundarySource = null
}

function removeConfirmedBoundary(): void {
  confirmedBoundaryShape?.remove()
  confirmedBoundaryShape = null
}

export function clearStudyArea(): void {
  cancelDrawingMode()
  removePendingBoundary()
  removeConfirmedBoundary()
  clearRooftops()
  state.boundary = []
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
  clearStudyArea()
  locationMarker?.remove()
  locationMarker = null
}

export function clearRooftops(): void {
  roofLayers.forEach((layer) => layer.remove())
  roofLayers.clear()
}

export function drawRooftops(rooftops: Rooftop[]): void {
  clearRooftops()

  for (const rooftop of rooftops) {
    const polygon = rooftop.polygon as GeoJSON.Feature<GeoJSON.Polygon>
    const latlngs = polygon.geometry.coordinates[0].map(
      ([lng, lat]) => [lat, lng] as LatLngTuple,
    )

    const layer = L.polygon(latlngs, roofStyle(rooftop)).addTo(map)
    layer.bindTooltip(roofTooltip(rooftop), { sticky: true, direction: 'top' })
    layer.on('click', () => onRoofClick?.(rooftop.id))
    roofLayers.set(rooftop.id, layer)
  }
}

function searchableRoofText(rooftop: Rooftop): string {
  return [
    rooftop.greenType,
    rooftop.heightSource,
    heightSourceLabel(rooftop.heightSource),
    rooftop.heightConfidence,
    rooftop.osmTags.name ?? '',
    rooftop.osmTags.building ?? '',
    rooftop.heightM?.toFixed(1) ?? '',
    rooftop.buildingLevels?.toString() ?? '',
  ]
    .join(' ')
    .toLowerCase()
}

function roofFill(rooftop: Rooftop): string {
  if (state.mapDisplay === 'height') return heightColour(rooftop.heightM)
  if (state.mapDisplay === 'height-confidence') {
    return confidenceColour(rooftop.heightConfidence)
  }
  return state.showAfter ? COLORS[rooftop.greenType] : COLORS.BEFORE
}

function roofTooltip(rooftop: Rooftop): string {
  const height =
    rooftop.heightM === null ? 'No height data' : `${rooftop.heightM.toFixed(1)} m`
  return `<strong>Relative roof Z: ${height}</strong><br>${heightSourceLabel(rooftop.heightSource)}`
}

function roofStyle(rooftop: Rooftop): L.PathOptions {
  const fill = roofFill(rooftop)
  const selected = rooftop.id === state.selectedId
  const query = state.filter.trim().toLowerCase()
  const matches = query === '' || searchableRoofText(rooftop).includes(query)
  const missingHeight =
    (state.mapDisplay === 'height' || state.mapDisplay === 'height-confidence') &&
    rooftop.heightM === null

  return {
    color: selected ? COLORS.SELECTED : missingHeight ? '#777a78' : '#3e4b50',
    weight: selected ? 3 : missingHeight ? 1.5 : 1,
    dashArray: missingHeight ? '4 3' : '',
    fillColor: fill,
    fillOpacity: matches ? (missingHeight ? 0.48 : 0.78) : 0.14,
    opacity: matches ? 1 : 0.28,
  }
}

export function restyleRooftops(rooftops: Rooftop[]): void {
  for (const rooftop of rooftops) {
    roofLayers.get(rooftop.id)?.setStyle(roofStyle(rooftop))
  }
}
