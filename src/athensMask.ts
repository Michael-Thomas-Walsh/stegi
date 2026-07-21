// Greater Athens context boundary and outside-area treatment.
//
// Greater Athens is represented by the five regional units that form the
// continuous Athens–Piraeus urban area:
//   - Central Athens
//   - North Athens
//   - South Athens
//   - West Athens
//   - Piraeus
//
// The area outside that combined outline remains fully visible. It receives
// only a transparent top-left-to-bottom-right diagonal hatch; there is no
// opaque grey wash or desaturation layer.

import L from 'leaflet'
import * as turf from '@turf/turf'
import { ATHENS_STUDY_BOUNDS } from './athens'

const GREATER_ATHENS_OSM_IDS = [
  'R2604796', // Central Athens
  'R2607262', // North Athens
  'R2612469', // South Athens
  'R2612423', // West Athens
  'R2616826', // Piraeus
] as const

const BOUNDARY_CACHE_KEY = 'stegi-greater-athens-boundary-v2'
const MASK_PANE = 'stegi-athens-mask-pane'
const HATCH_PATTERN_ID = 'stegi-greater-athens-outside-hatch-v3'

type AthensGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon
type AthensFeature = GeoJSON.Feature<AthensGeometry>

function isAthensGeometry(
  value: GeoJSON.Geometry | null | undefined,
): value is AthensGeometry {
  return value?.type === 'Polygon' || value?.type === 'MultiPolygon'
}

function readCachedBoundary(): AthensFeature | null {
  try {
    const cached = window.localStorage.getItem(BOUNDARY_CACHE_KEY)
    if (!cached) return null

    const parsed = JSON.parse(cached) as AthensFeature
    return isAthensGeometry(parsed.geometry) ? parsed : null
  } catch {
    return null
  }
}

function cacheBoundary(feature: AthensFeature): void {
  try {
    window.localStorage.setItem(BOUNDARY_CACHE_KEY, JSON.stringify(feature))
  } catch {
    // Storage may be unavailable in privacy modes. The map still works.
  }
}

function mergeRegionalUnits(features: AthensFeature[]): AthensFeature {
  const collection = turf.featureCollection(features)
  const merged = turf.union(collection)

  if (!merged || !isAthensGeometry(merged.geometry)) {
    throw new Error('The Greater Athens regional units could not be merged.')
  }

  return {
    type: 'Feature',
    properties: {
      name: 'Greater Athens',
      source:
        'OpenStreetMap regional units: Central, North, South and West Athens, plus Piraeus',
    },
    geometry: merged.geometry,
  }
}

async function fetchGreaterAthensBoundary(): Promise<AthensFeature> {
  const params = new URLSearchParams({
    osm_ids: GREATER_ATHENS_OSM_IDS.join(','),
    format: 'geojson',
    polygon_geojson: '1',
    polygon_threshold: '0.00004',
  })

  const response = await fetch(
    `https://nominatim.openstreetmap.org/lookup?${params.toString()}`,
    {
      headers: {
        Accept: 'application/geo+json, application/json',
      },
    },
  )

  if (!response.ok) {
    throw new Error(
      `Greater Athens boundary request failed (${response.status}).`,
    )
  }

  const data = (await response.json()) as GeoJSON.FeatureCollection
  const regionalUnits = data.features
    .filter((item) => isAthensGeometry(item.geometry))
    .map(
      (item): AthensFeature => ({
        type: 'Feature',
        properties: item.properties ?? {},
        geometry: item.geometry as AthensGeometry,
      }),
    )

  if (regionalUnits.length !== GREATER_ATHENS_OSM_IDS.length) {
    throw new Error(
      `Expected ${GREATER_ATHENS_OSM_IDS.length} Greater Athens regional units but received ${regionalUnits.length}.`,
    )
  }

  const greaterAthens = mergeRegionalUnits(regionalUnits)
  cacheBoundary(greaterAthens)
  return greaterAthens
}

function fallbackBoundary(): AthensFeature {
  const { south, west, north, east } = ATHENS_STUDY_BOUNDS

  return {
    type: 'Feature',
    properties: {
      name: 'Greater Athens study area',
      source: 'STÉGI fallback envelope',
    },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ]],
    },
  }
}

function getOuterRings(feature: AthensFeature): L.LatLngTuple[][] {
  const geometry = feature.geometry
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates

  return polygons.map((polygon) =>
    polygon[0].map(([lng, lat]) => [lat, lng] as L.LatLngTuple),
  )
}

function createMaskRings(feature: AthensFeature): L.LatLngTuple[][] {
  // A context frame around metropolitan Athens. The first ring is the filled
  // outside area; the Greater Athens rings that follow are transparent holes.
  const outer: L.LatLngTuple[] = [
    [37.42, 23.10],
    [37.42, 24.45],
    [38.52, 24.45],
    [38.52, 23.10],
    [37.42, 23.10],
  ]

  return [outer, ...getOuterRings(feature)]
}

function installHatchPattern(path: SVGPathElement): void {
  const svg = path.ownerSVGElement
  if (!svg) return

  let defs = svg.querySelector('defs')
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    svg.insertBefore(defs, svg.firstChild)
  }

  if (!defs.querySelector(`#${HATCH_PATTERN_ID}`)) {
    const pattern = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'pattern',
    )
    pattern.setAttribute('id', HATCH_PATTERN_ID)
    pattern.setAttribute('patternUnits', 'userSpaceOnUse')
    pattern.setAttribute('width', '20')
    pattern.setAttribute('height', '20')

    // Explicitly draw a descending diagonal: top-left to bottom-right (\\).
    // The pattern has no background fill, so the map remains visible beneath.
    const line = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'line',
    )
    line.setAttribute('x1', '0')
    line.setAttribute('y1', '0')
    line.setAttribute('x2', '20')
    line.setAttribute('y2', '20')
    line.setAttribute('stroke', '#515856')
    line.setAttribute('stroke-opacity', '0.13')
    line.setAttribute('stroke-width', '1')

    pattern.appendChild(line)
    defs.appendChild(pattern)
  }

  path.setAttribute('fill', `url(#${HATCH_PATTERN_ID})`)
  path.setAttribute('fill-opacity', '1')
}

function drawGreaterAthensContext(
  map: L.Map,
  feature: AthensFeature,
): void {
  const hatch = L.polygon(createMaskRings(feature), {
    pane: MASK_PANE,
    stroke: false,
    fillColor: 'transparent',
    fillOpacity: 1,
    fillRule: 'evenodd',
    interactive: false,
    className: 'stegi-athens-outside-hatch',
  }).addTo(map)

  const hatchPath = hatch.getElement()
  if (hatchPath instanceof SVGPathElement) installHatchPattern(hatchPath)

  L.geoJSON(feature, {
    pane: MASK_PANE,
    interactive: false,
    style: {
      color: '#4f743c',
      weight: 2.5,
      opacity: 0.98,
      fill: false,
      lineCap: 'round',
      lineJoin: 'round',
      className: 'stegi-athens-boundary-line',
    },
  }).addTo(map)
}

export function installAthensContext(map: L.Map): void {
  const pane = map.createPane(MASK_PANE)
  pane.style.zIndex = '360'
  pane.style.pointerEvents = 'none'

  const cached = readCachedBoundary()
  if (cached) {
    drawGreaterAthensContext(map, cached)
    return
  }

  window.setTimeout(() => {
    void fetchGreaterAthensBoundary()
      .then((feature) => drawGreaterAthensContext(map, feature))
      .catch((error: unknown) => {
        console.warn('Using the fallback Greater Athens boundary.', error)
        drawGreaterAthensContext(map, fallbackBoundary())
      })
  }, 1200)
}
