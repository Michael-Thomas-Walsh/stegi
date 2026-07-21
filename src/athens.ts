// A deliberately conservative Athens study-area envelope used for the first
// location-input release. It prevents geocoding, drawing and uploaded site
// boundaries from wandering into the rest of Attica.
//
// This is an application study boundary, not a legal/administrative dataset.
// It can later be replaced with a detailed municipal GeoJSON polygon without
// changing the public helper functions in this file.

export type LatLngTuple = [number, number]

export const ATHENS_STUDY_BOUNDS = {
  south: 37.923,
  west: 23.680,
  north: 38.035,
  east: 23.815,
} as const

export const ATHENS_CENTER: LatLngTuple = [37.9838, 23.7275]

// Nominatim expects: left, top, right, bottom.
export const ATHENS_NOMINATIM_VIEWBOX = [
  ATHENS_STUDY_BOUNDS.west,
  ATHENS_STUDY_BOUNDS.north,
  ATHENS_STUDY_BOUNDS.east,
  ATHENS_STUDY_BOUNDS.south,
].join(',')

export function isInsideAthens(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= ATHENS_STUDY_BOUNDS.south &&
    lat <= ATHENS_STUDY_BOUNDS.north &&
    lng >= ATHENS_STUDY_BOUNDS.west &&
    lng <= ATHENS_STUDY_BOUNDS.east
  )
}

export function validateAthensBoundary(boundary: LatLngTuple[]): string | null {
  if (boundary.length < 3) {
    return 'The boundary needs at least three valid vertices.'
  }

  const outsideCount = boundary.filter(([lat, lng]) => !isInsideAthens(lat, lng)).length
  if (outsideCount > 0) {
    return `${outsideCount} boundary ${outsideCount === 1 ? 'vertex is' : 'vertices are'} outside the Athens study area.`
  }

  return null
}
