// Fetches building footprints and green spaces from public Overpass servers.
// Progress events are exposed so the interface can explain retries instead of
// appearing frozen while a public server is busy.

import * as turf from '@turf/turf'

interface OverpassServer {
  name: string
  url: string
}

const OVERPASS_SERVERS: OverpassServer[] = [
  {
    name: 'Overpass API',
    url: 'https://overpass-api.de/api/interpreter',
  },
  {
    name: 'Kumi Overpass',
    url: 'https://overpass.kumi.systems/api/interpreter',
  },
  {
    name: 'Mail.ru Overpass',
    url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  },
]

const REQUEST_TIMEOUT_MS = 38_000

interface OverpassGeometryPoint {
  lat: number
  lon: number
}

interface OverpassElement {
  id?: number
  type: string
  geometry?: OverpassGeometryPoint[]
  tags?: Record<string, string>
}

interface OverpassResponse {
  elements?: OverpassElement[]
}

export type OsmProgressStage =
  | 'query'
  | 'connecting'
  | 'retrying'
  | 'downloaded'
  | 'processing'
  | 'complete'

export interface OsmProgressEvent {
  stage: OsmProgressStage
  message: string
  serverIndex?: number
  serverCount?: number
  elementCount?: number
  shapeCount?: number
}

export type OsmProgressCallback = (event: OsmProgressEvent) => void

export interface OsmShape {
  polygon: GeoJSON.Feature<GeoJSON.Polygon>
  isGreen: boolean
  osmId: number | null
  tags: Record<string, string>
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'request timed out'
  }
  return error instanceof Error ? error.message : 'unknown network error'
}

async function fetchFromAnyOverpass(
  query: string,
  onProgress?: OsmProgressCallback,
): Promise<OverpassResponse> {
  let lastError: unknown

  for (let index = 0; index < OVERPASS_SERVERS.length; index += 1) {
    const server = OVERPASS_SERVERS[index]
    const attempt = index + 1

    onProgress?.({
      stage: 'connecting',
      message: `Contacting ${server.name} (${attempt}/${OVERPASS_SERVERS.length})…`,
      serverIndex: attempt,
      serverCount: OVERPASS_SERVERS.length,
    })

    const controller = new AbortController()
    const timeout = window.setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    )

    try {
      const response = await fetch(server.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`server returned HTTP ${response.status}`)
      }

      const data = (await response.json()) as OverpassResponse
      const elementCount = Array.isArray(data.elements) ? data.elements.length : 0

      onProgress?.({
        stage: 'downloaded',
        message: `${server.name} returned ${elementCount.toLocaleString()} map elements.`,
        serverIndex: attempt,
        serverCount: OVERPASS_SERVERS.length,
        elementCount,
      })

      return data
    } catch (error) {
      lastError = error
      const hasBackup = attempt < OVERPASS_SERVERS.length

      onProgress?.({
        stage: 'retrying',
        message: hasBackup
          ? `${server.name} failed (${errorMessage(error)}). Trying the next public server…`
          : `${server.name} failed (${errorMessage(error)}).`,
        serverIndex: attempt,
        serverCount: OVERPASS_SERVERS.length,
      })
    } finally {
      window.clearTimeout(timeout)
    }
  }

  throw lastError ?? new Error('All Overpass servers failed.')
}

export async function fetchShapes(
  boundary: [number, number][],
  onProgress?: OsmProgressCallback,
): Promise<OsmShape[]> {
  if (boundary.length < 3) {
    throw new Error('The confirmed boundary needs at least three vertices.')
  }

  onProgress?.({
    stage: 'query',
    message: 'Preparing the OpenStreetMap query for footprints and height tags…',
  })

  // Overpass expects latitude/longitude pairs in one polygon string. `out geom`
  // returns both the geometry and the OSM tags, including height and levels.
  const polyStr = boundary.map(([lat, lng]) => `${lat} ${lng}`).join(' ')
  const query = `
    [out:json][timeout:25];
    (
      way["building"](poly:"${polyStr}");
      way["leisure"~"^(park|garden)$"](poly:"${polyStr}");
      way["landuse"~"^(grass|recreation_ground|village_green)$"](poly:"${polyStr}");
    );
    out geom;
  `

  const data = await fetchFromAnyOverpass(query, onProgress)
  const elements = Array.isArray(data.elements) ? data.elements : []

  onProgress?.({
    stage: 'processing',
    message: 'Converting map geometry and retaining building height attributes…',
    elementCount: elements.length,
  })

  const shapes: OsmShape[] = []

  for (const element of elements) {
    if (
      element.type !== 'way' ||
      !element.geometry ||
      element.geometry.length < 4
    ) {
      continue
    }

    const ring = element.geometry.map(({ lat, lon }) => [lon, lat])
    const first = ring[0]
    const last = ring[ring.length - 1]

    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([...first])
    }

    if (ring.length < 4) continue

    const tags = element.tags ?? {}
    const isGreen = 'leisure' in tags || 'landuse' in tags

    try {
      shapes.push({
        polygon: turf.polygon([ring]),
        isGreen,
        osmId: typeof element.id === 'number' ? element.id : null,
        tags: { ...tags },
      })
    } catch {
      // Ignore malformed OSM rings rather than failing the whole study area.
    }
  }

  onProgress?.({
    stage: 'complete',
    message: `${shapes.length.toLocaleString()} valid map shapes prepared, including available height tags.`,
    elementCount: elements.length,
    shapeCount: shapes.length,
  })

  return shapes
}
