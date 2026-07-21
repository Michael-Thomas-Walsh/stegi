// Turns each raw building footprint into a "feature vector": a row of
// numbers describing the rooftop, which the clustering step then groups.

import * as turf from '@turf/turf'
import type { OsmShape } from './osm'
import type { Rooftop } from './state'
import { MIN_ROOF_AREA_M2 } from './constants'

const NEIGHBOUR_RADIUS_M = 60 // "nearby" = within this distance
const DEFAULT_DISTANCE_TO_GREEN_M = 500 // used when no green space is found

// centre point of a shape as [lon, lat]
function centre(shape: GeoJSON.Feature<GeoJSON.Polygon>): [number, number] {
  return turf.centroid(shape).geometry.coordinates as [number, number]
}

// metres between two [lon, lat] points
function metres(a: [number, number], b: [number, number]): number {
  return turf.distance(a, b, { units: 'meters' })
}

// Orientation (0–180°) = compass bearing of the roof's longest edge.
function orientation(ring: number[][]): number {
  let longest = 0
  let bearing = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i] as [number, number]
    const b = ring[i + 1] as [number, number]
    const len = metres(a, b)
    if (len > longest) {
      longest = len
      bearing = turf.bearing(a, b)
    }
  }
  // Fold -180..180 into 0..180 (a wall and its opposite face the same way).
  return ((bearing % 180) + 180) % 180
}

// Long side / short side of the roof's bounding box (1 = square).
function aspectRatio(shape: GeoJSON.Feature<GeoJSON.Polygon>): number {
  const [minX, minY, maxX, maxY] = turf.bbox(shape)
  const midY = (minY + maxY) / 2
  const midX = (minX + maxX) / 2
  const width = metres([minX, midY], [maxX, midY])
  const height = metres([midX, minY], [midX, maxY])
  const long = Math.max(width, height)
  const short = Math.max(Math.min(width, height), 1) // avoid divide-by-zero
  return long / short
}

// Build the full list of rooftops with their feature vectors.
// Tiny roofs are dropped; green spaces are used only as distance targets.
export function buildRooftops(shapes: OsmShape[]): Rooftop[] {
  const buildings = shapes.filter((s) => !s.isGreen)
  const greenCentres = shapes
    .filter((s) => s.isGreen)
    .map((s) => centre(s.polygon))

  const buildingCentres = buildings.map((b) => centre(b.polygon))
  const rooftops: Rooftop[] = []

  buildings.forEach((b, i) => {
    const area = turf.area(b.polygon)
    if (area < MIN_ROOF_AREA_M2) return // too small to be useful

    const c = buildingCentres[i]
    const ring = b.polygon.geometry.coordinates[0]

    // Local building density: how many neighbours are close by.
    let density = 0
    for (let j = 0; j < buildingCentres.length; j++) {
      if (j === i) continue
      if (metres(c, buildingCentres[j]) <= NEIGHBOUR_RADIUS_M) density++
    }

    // Distance to the nearest existing green space (capped when none exist).
    let distanceToGreen = DEFAULT_DISTANCE_TO_GREEN_M
    for (const g of greenCentres) {
      distanceToGreen = Math.min(distanceToGreen, metres(c, g))
    }

    // Simple heat proxy: denser + farther from green = hotter.
    const heatProxy = density + distanceToGreen / 100

    rooftops.push({
      id: rooftops.length,
      polygon: b.polygon,
      area,
      aspectRatio: aspectRatio(b.polygon),
      orientation: orientation(ring),
      density,
      distanceToGreen,
      heatProxy,
      // Filled in by later steps:
      cluster: -1,
      greenType: 'GARDEN',
      coolingC: 0,
      costEur: 0,
    })
  })

  return rooftops
}
