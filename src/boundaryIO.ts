// Browser-side zipped shapefile import. shpjs reads the SHP/SHX/DBF/PRJ files
// and returns GeoJSON. STÉGI uses the largest polygon as the study boundary.

import * as turf from '@turf/turf'
import shp from 'shpjs'
import { type LatLngTuple, validateAthensBoundary } from './athens'

export interface BoundaryFileResult {
  boundary: LatLngTuple[]
  polygonCount: number
  notice: string | null
}

type CoordinateRing = number[][]

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null
}

function collectOuterRings(value: unknown): CoordinateRing[] {
  const object = asObject(value)
  if (!object) return []

  if (object.type === 'FeatureCollection') {
    const features = Array.isArray(object.features) ? object.features : []
    return features.flatMap(collectOuterRings)
  }

  if (object.type === 'Feature') return collectOuterRings(object.geometry)

  if (object.type === 'GeometryCollection') {
    const geometries = Array.isArray(object.geometries)
      ? object.geometries
      : []
    return geometries.flatMap(collectOuterRings)
  }

  if (object.type === 'Polygon') {
    const coordinates = Array.isArray(object.coordinates)
      ? object.coordinates
      : []
    const outerRing = coordinates[0]
    return Array.isArray(outerRing) ? [outerRing as CoordinateRing] : []
  }

  if (object.type === 'MultiPolygon') {
    const coordinates = Array.isArray(object.coordinates)
      ? object.coordinates
      : []

    return coordinates.flatMap((polygonCoordinates) => {
      if (!Array.isArray(polygonCoordinates)) return []
      const outerRing = polygonCoordinates[0]
      return Array.isArray(outerRing) ? [outerRing as CoordinateRing] : []
    })
  }

  return []
}

function cleanRing(ring: CoordinateRing): CoordinateRing {
  const cleaned = ring
    .filter(
      (position) =>
        Array.isArray(position) &&
        position.length >= 2 &&
        Number.isFinite(Number(position[0])) &&
        Number.isFinite(Number(position[1])),
    )
    .map((position) => [Number(position[0]), Number(position[1])])

  if (cleaned.length > 1) {
    const first = cleaned[0]
    const last = cleaned[cleaned.length - 1]
    if (first[0] === last[0] && first[1] === last[1]) cleaned.pop()
  }

  return cleaned
}

function ringArea(ring: CoordinateRing): number {
  if (ring.length < 3) return 0
  return turf.area(turf.polygon([[...ring, ring[0]]]))
}

function boundaryFromGeoJSON(value: unknown): BoundaryFileResult {
  const rings = collectOuterRings(value)
    .map(cleanRing)
    .filter((ring) => ring.length >= 3)

  if (rings.length === 0) {
    throw new Error('The shapefile does not contain a valid polygon.')
  }

  const largest = rings.reduce((best, current) =>
    ringArea(current) > ringArea(best) ? current : best,
  )

  // shpjs returns standard GeoJSON [longitude, latitude]. STÉGI stores the
  // Overpass boundary as [latitude, longitude].
  const boundary: LatLngTuple[] = largest.map(([lng, lat]) => [lat, lng])
  const validationError = validateAthensBoundary(boundary)
  if (validationError) throw new Error(validationError)

  return {
    boundary,
    polygonCount: rings.length,
    notice:
      rings.length > 1
        ? `The shapefile contains ${rings.length} polygons. The largest polygon was selected.`
        : null,
  }
}

export async function readBoundaryFile(
  file: File,
): Promise<BoundaryFileResult> {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    throw new Error('Choose a ZIP containing the shapefile components.')
  }

  let parsed: unknown
  try {
    parsed = (await shp(await file.arrayBuffer())) as unknown
  } catch (error) {
    console.error('Shapefile read error:', error)
    throw new Error(
      'The shapefile could not be read. Check that the ZIP contains SHP, SHX and DBF files, plus a PRJ file when coordinates are not WGS84.',
    )
  }

  // shpjs returns an array when a ZIP contains more than one shapefile.
  if (Array.isArray(parsed)) {
    return boundaryFromGeoJSON({
      type: 'FeatureCollection',
      features: parsed.flatMap((collection) => {
        const object = asObject(collection)
        return Array.isArray(object?.features) ? object.features : []
      }),
    })
  }

  return boundaryFromGeoJSON(parsed)
}
