// Greater Athens working extent.
//
// STÉGI now treats the Athens–Piraeus urban area as the project geography,
// rather than restricting searches and boundaries to the Municipality of
// Athens. The detailed map outline is assembled separately from the five
// regional units that make up Greater Athens.
//
// This bounding envelope is intentionally a little generous. It is used for
// fast, synchronous checks while searching, drawing and uploading. The visible
// outline on the map is the more detailed Greater Athens geometry.

export type LatLngTuple = [number, number]

export const ATHENS_STUDY_BOUNDS = {
  south: 37.78,
  west: 23.50,
  north: 38.16,
  east: 24.02,
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

  const outsideCount = boundary.filter(
    ([lat, lng]) => !isInsideAthens(lat, lng),
  ).length

  if (outsideCount > 0) {
    return `${outsideCount} boundary ${
      outsideCount === 1 ? 'vertex is' : 'vertices are'
    } outside the Greater Athens study area.`
  }

  return null
}
