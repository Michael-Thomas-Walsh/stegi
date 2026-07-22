// Turns each raw building footprint into a feature vector: a row of numbers
// describing the rooftop, which the clustering step then groups.

import * as turf from '@turf/turf'
import type { OsmShape } from './osm'
import type { Rooftop } from './state'
import { MIN_ROOF_AREA_M2 } from './constants'
import { deriveBuildingHeight } from './height'

const NEIGHBOUR_RADIUS_M = 60
const DEFAULT_DISTANCE_TO_GREEN_M = 500

function centre(shape: GeoJSON.Feature<GeoJSON.Polygon>): [number, number] {
  return turf.centroid(shape).geometry.coordinates as [number, number]
}

function metres(a: [number, number], b: [number, number]): number {
  return turf.distance(a, b, { units: 'meters' })
}

function orientation(ring: number[][]): number {
  let longest = 0
  let bearing = 0

  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i] as [number, number]
    const b = ring[i + 1] as [number, number]
    const length = metres(a, b)

    if (length > longest) {
      longest = length
      bearing = turf.bearing(a, b)
    }
  }

  return ((bearing % 180) + 180) % 180
}

function aspectRatio(shape: GeoJSON.Feature<GeoJSON.Polygon>): number {
  const [minX, minY, maxX, maxY] = turf.bbox(shape)
  const midY = (minY + maxY) / 2
  const midX = (minX + maxX) / 2
  const width = metres([minX, midY], [maxX, midY])
  const height = metres([midX, minY], [midX, maxY])
  const long = Math.max(width, height)
  const short = Math.max(Math.min(width, height), 1)
  return long / short
}

export function buildRooftops(shapes: OsmShape[]): Rooftop[] {
  const buildings = shapes.filter((shape) => !shape.isGreen)
  const greenCentres = shapes
    .filter((shape) => shape.isGreen)
    .map((shape) => centre(shape.polygon))
  const buildingCentres = buildings.map((building) => centre(building.polygon))
  const rooftops: Rooftop[] = []

  buildings.forEach((building, index) => {
    const area = turf.area(building.polygon)
    if (area < MIN_ROOF_AREA_M2) return

    const buildingCentre = buildingCentres[index]
    const ring = building.polygon.geometry.coordinates[0]

    let density = 0
    for (let neighbourIndex = 0; neighbourIndex < buildingCentres.length; neighbourIndex += 1) {
      if (neighbourIndex === index) continue
      if (metres(buildingCentre, buildingCentres[neighbourIndex]) <= NEIGHBOUR_RADIUS_M) {
        density += 1
      }
    }

    let distanceToGreen = DEFAULT_DISTANCE_TO_GREEN_M
    for (const greenCentre of greenCentres) {
      distanceToGreen = Math.min(
        distanceToGreen,
        metres(buildingCentre, greenCentre),
      )
    }

    const heatProxy = density + distanceToGreen / 100
    const height = deriveBuildingHeight(building.tags)

    rooftops.push({
      id: rooftops.length,
      polygon: building.polygon,
      osmId: building.osmId,
      osmTags: building.tags,
      area,
      aspectRatio: aspectRatio(building.polygon),
      orientation: orientation(ring),
      density,
      distanceToGreen,
      heatProxy,
      heightM: height.heightM,
      buildingLevels: height.levels,
      roofHeightM: height.roofHeightM,
      roofLevels: height.roofLevels,
      heightSource: height.source,
      heightConfidence: height.confidence,
      heightMatchScore: null,
      heightMatchMethod: null,
      heightMatchCandidates: null,
      heightDatasetConfidence: null,
      heightDatasetVariance: null,
      heightDatasetSource: null,
      heightDatasetId: null,
      heightInferenceNeighbours: null,
      cluster: -1,
      greenType: 'GARDEN',
      coolingC: 0,
      costEur: 0,
    })
  })

  return rooftops
}
