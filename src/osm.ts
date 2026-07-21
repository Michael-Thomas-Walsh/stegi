// Fetches map data from the free, keyless Overpass API (OpenStreetMap).
// Given the boundary the user drew, it returns building footprints and any
// existing green spaces inside it — all in the browser, no account needed.

import * as turf from '@turf/turf'

// The public Overpass servers get busy and sometimes time out (HTTP 504).
// We try them in order and move to the next one if a request fails, so a
// single overloaded server doesn't break detection.
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

// Send the query to each Overpass server in turn; return the first that
// answers. Throws only if every server fails.
async function fetchFromAnyOverpass(query: string): Promise<any> {
  let lastError: unknown
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
      })
      if (!res.ok) throw new Error(`Overpass returned ${res.status}`)
      return await res.json()
    } catch (err) {
      lastError = err // try the next server
    }
  }
  throw lastError ?? new Error('All Overpass servers failed')
}

// A raw shape straight from OSM, before we compute anything about it.
export interface OsmShape {
  polygon: GeoJSON.Feature<GeoJSON.Polygon>
  isGreen: boolean // true = existing park/garden/grass, false = a building
}

// boundary is a list of [lat, lng] points (how Leaflet gives them to us).
export async function fetchShapes(
  boundary: [number, number][],
): Promise<OsmShape[]> {
  // Overpass wants the polygon as "lat lon lat lon ..." in one string.
  const polyStr = boundary.map(([lat, lng]) => `${lat} ${lng}`).join(' ')

  // One query: buildings AND green spaces inside the drawn polygon.
  const query = `
    [out:json][timeout:25];
    (
      way["building"](poly:"${polyStr}");
      way["leisure"~"^(park|garden)$"](poly:"${polyStr}");
      way["landuse"~"^(grass|recreation_ground|village_green)$"](poly:"${polyStr}");
    );
    out geom;
  `

  const data = await fetchFromAnyOverpass(query)
  const shapes: OsmShape[] = []

  for (const el of data.elements) {
    // We only handle closed ways with real geometry.
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 4) continue

    // Build a GeoJSON ring (lon, lat order) and close it if needed.
    const ring = el.geometry.map((g: { lat: number; lon: number }) => [
      g.lon,
      g.lat,
    ])
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first)
    if (ring.length < 4) continue

    const tags = el.tags ?? {}
    const isGreen = 'leisure' in tags || 'landuse' in tags

    shapes.push({ polygon: turf.polygon([ring]), isGreen })
  }

  return shapes
}
