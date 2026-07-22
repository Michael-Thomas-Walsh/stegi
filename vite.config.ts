import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { defineConfig, type Plugin } from 'vite'

interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

interface MicrosoftTile extends Bounds {
  quadkey: string
  url: string
}

type PolygonGeometry = { type: 'Polygon'; coordinates: unknown[] }
type MultiPolygonGeometry = { type: 'MultiPolygon'; coordinates: unknown[] }
type BuildingGeometry = PolygonGeometry | MultiPolygonGeometry

interface CandidateFeature {
  type: 'Feature'
  properties: {
    height: number
    confidence: number | null
  }
  geometry: BuildingGeometry
}

interface ParsedFeature {
  type?: string
  properties?: Record<string, unknown>
  geometry?: { type?: string; coordinates?: unknown[] }
}

type Middleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => void | Promise<void>

interface CandidateResponse {
  type: 'FeatureCollection'
  features: CandidateFeature[]
  metadata: {
    source: 'Microsoft Global ML Building Footprints'
    queriedTiles: string[]
    scannedFeatures: number
    heightFeatures: number
    returnedFeatures: number
    cachedQuery: boolean
  }
}

const MAX_QUERY_SPAN_DEGREES = 0.2
const MAX_RETURNED_FEATURES = 60_000
const TILE_SPLIT_LONGITUDE = 23.90625
const CACHE_ROOT = path.join(tmpdir(), 'stegi-microsoft-height-cache-v1')

// Greater Athens crosses two Microsoft level-9 quadkey partitions. The URLs
// come from Microsoft's official dataset-links.csv release dated 2026-02-03.
const MICROSOFT_TILES: MicrosoftTile[] = [
  {
    quadkey: '122100203',
    west: 23.203125,
    south: 37.718590325588146,
    east: TILE_SPLIT_LONGITUDE,
    north: 38.27268853598096,
    url: 'https://minedbuildings.z5.web.core.windows.net/global-buildings/2026-02-03/global-buildings.geojsonl/RegionName=Greece/quadkey=122100203/part-00033-4feead82-d499-422b-94cb-c036c212127a.c000.csv.gz',
  },
  {
    quadkey: '122100212',
    west: TILE_SPLIT_LONGITUDE,
    south: 37.718590325588146,
    east: 24.609375,
    north: 38.27268853598096,
    url: 'https://minedbuildings.z5.web.core.windows.net/global-buildings/2026-02-03/global-buildings.geojsonl/RegionName=Greece/quadkey=122100212/part-00035-4feead82-d499-422b-94cb-c036c212127a.c000.csv.gz',
  },
]

const activeDownloads = new Map<string, Promise<string>>()

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function parseBounds(url: URL): Bounds {
  const west = finiteNumber(url.searchParams.get('west'))
  const south = finiteNumber(url.searchParams.get('south'))
  const east = finiteNumber(url.searchParams.get('east'))
  const north = finiteNumber(url.searchParams.get('north'))

  if (west === null || south === null || east === null || north === null) {
    throw new Error('west, south, east and north query parameters are required.')
  }
  if (west >= east || south >= north) {
    throw new Error('The requested height bounding box is invalid.')
  }
  if (
    east - west > MAX_QUERY_SPAN_DEGREES ||
    north - south > MAX_QUERY_SPAN_DEGREES
  ) {
    throw new Error(
      'The study boundary is too large for ML height enrichment. Confirm a smaller boundary and try again.',
    )
  }

  return { west, south, east, north }
}

function geometryBounds(
  geometry: BuildingGeometry,
): Bounds | null {
  let west = Number.POSITIVE_INFINITY
  let south = Number.POSITIVE_INFINITY
  let east = Number.NEGATIVE_INFINITY
  let north = Number.NEGATIVE_INFINITY

  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return
    if (
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    ) {
      const lng = value[0]
      const lat = value[1]
      west = Math.min(west, lng)
      south = Math.min(south, lat)
      east = Math.max(east, lng)
      north = Math.max(north, lat)
      return
    }
    for (const child of value) visit(child)
  }

  visit(geometry.coordinates)
  if (![west, south, east, north].every(Number.isFinite)) return null
  return { west, south, east, north }
}

function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return !(
    a.east < b.west ||
    a.west > b.east ||
    a.north < b.south ||
    a.south > b.north
  )
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function downloadTile(tile: MicrosoftTile): Promise<string> {
  await mkdir(CACHE_ROOT, { recursive: true })
  const destination = path.join(CACHE_ROOT, `${tile.quadkey}.geojsonl.gz`)
  if (await fileExists(destination)) return destination

  const existing = activeDownloads.get(tile.quadkey)
  if (existing) return existing

  const download = (async (): Promise<string> => {
    const temporary = `${destination}.part`
    const response = await fetch(tile.url)
    if (!response.ok || !response.body) {
      throw new Error(
        `Microsoft height tile ${tile.quadkey} returned HTTP ${response.status}.`,
      )
    }

    const source = Readable.fromWeb(
      response.body as any,
    )
    await pipeline(source, createWriteStream(temporary))
    await rename(temporary, destination)
    return destination
  })()

  activeDownloads.set(tile.quadkey, download)
  try {
    return await download
  } finally {
    activeDownloads.delete(tile.quadkey)
  }
}

function readHeight(properties: Record<string, unknown>): number | null {
  const value = finiteNumber(
    properties.height ??
      properties.Height ??
      properties.building_height ??
      properties['building:height'],
  )
  return value !== null && value >= 1.5 && value <= 500 ? value : null
}

function readConfidence(properties: Record<string, unknown>): number | null {
  const value = finiteNumber(properties.confidence ?? properties.Confidence)
  return value !== null && value >= 0 && value <= 1 ? value : null
}

async function scanTile(
  filePath: string,
  queryBounds: Bounds,
  features: CandidateFeature[],
): Promise<{ scanned: number; withHeight: number }> {
  const gunzip = createGunzip()
  const lines = createInterface({
    input: createReadStream(filePath).pipe(gunzip),
    crlfDelay: Number.POSITIVE_INFINITY,
  })

  let scanned = 0
  let withHeight = 0

  for await (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    scanned += 1

    let parsed: ParsedFeature
    try {
      parsed = JSON.parse(line) as ParsedFeature
    } catch {
      continue
    }

    if (
      parsed.geometry?.type !== 'Polygon' &&
      parsed.geometry?.type !== 'MultiPolygon'
    ) {
      continue
    }

    const height = readHeight(parsed.properties ?? {})
    if (height === null) continue
    withHeight += 1

    const geometry = parsed.geometry as BuildingGeometry
    const featureBounds = geometryBounds(geometry)
    if (!featureBounds || !boundsIntersect(featureBounds, queryBounds)) continue

    features.push({
      type: 'Feature',
      properties: {
        height,
        confidence: readConfidence(parsed.properties ?? {}),
      },
      geometry,
    })

    if (features.length > MAX_RETURNED_FEATURES) {
      throw new Error(
        'The selected area contains too many ML height candidates. Use a smaller study boundary.',
      )
    }
  }

  return { scanned, withHeight }
}

function queryCachePath(bounds: Bounds, tiles: MicrosoftTile[]): string {
  const key = JSON.stringify({
    bounds: Object.fromEntries(
      Object.entries(bounds).map(([name, value]) => [name, value.toFixed(5)]),
    ),
    tiles: tiles.map((tile) => tile.quadkey),
  })
  const digest = createHash('sha1').update(key).digest('hex')
  return path.join(CACHE_ROOT, `query-${digest}.json`)
}

async function buildCandidateResponse(bounds: Bounds): Promise<CandidateResponse> {
  const tiles = MICROSOFT_TILES.filter((tile) =>
    boundsIntersect(bounds, tile),
  )
  if (tiles.length === 0) {
    throw new Error('The selected boundary is outside the Greater Athens height tiles.')
  }

  await mkdir(CACHE_ROOT, { recursive: true })
  const cachedPath = queryCachePath(bounds, tiles)
  if (await fileExists(cachedPath)) {
    const cached = JSON.parse(await readFile(cachedPath, 'utf8')) as CandidateResponse
    cached.metadata.cachedQuery = true
    return cached
  }

  const features: CandidateFeature[] = []
  let scannedFeatures = 0
  let heightFeatures = 0

  for (const tile of tiles) {
    const filePath = await downloadTile(tile)
    const stats = await scanTile(filePath, bounds, features)
    scannedFeatures += stats.scanned
    heightFeatures += stats.withHeight
  }

  const result: CandidateResponse = {
    type: 'FeatureCollection',
    features,
    metadata: {
      source: 'Microsoft Global ML Building Footprints',
      queriedTiles: tiles.map((tile) => tile.quadkey),
      scannedFeatures,
      heightFeatures,
      returnedFeatures: features.length,
      cachedQuery: false,
    },
  }

  await writeFile(cachedPath, JSON.stringify(result), 'utf8')
  return result
}


interface GbaCandidateFeature {
  type: 'Feature'
  properties: {
    height: number
    variance: number | null
    source: string | null
    sourceId: string | null
  }
  geometry: BuildingGeometry
}

interface GbaCandidateResponse {
  type: 'FeatureCollection'
  features: GbaCandidateFeature[]
  metadata: {
    source: 'GlobalBuildingAtlas LoD1'
    queriedTile: string
    returnedFeatures: number
    cachedQuery: boolean
    licence: 'CC BY-NC 4.0'
  }
}

interface GbaQueryRow {
  geometry_json?: string | null
  height?: number | string | null
  variance?: number | string | null
  source?: string | null
  source_id?: string | number | null
}

const GBA_TILE_NAME = 'e020_n40_e025_n35.parquet'
const GBA_TILE_URL =
  `https://data.source.coop/tge-labs/globalbuildingatlas-lod1/${GBA_TILE_NAME}`
const GBA_CACHE_ROOT = path.join(tmpdir(), 'stegi-gba-height-cache-v2')
const activeGbaQueries = new Map<string, Promise<GbaCandidateResponse>>()
let gbaConnectionPromise: Promise<any> | null = null

async function gbaConnection(): Promise<any> {
  if (gbaConnectionPromise) return gbaConnectionPromise

  gbaConnectionPromise = (async () => {
    const { DuckDBInstance } = await import('@duckdb/node-api')
    const instance = await DuckDBInstance.create(':memory:', {
      threads: '4',
      memory_limit: '1GB',
    })
    const connection = await instance.connect()

    // httpfs provides efficient HTTP range reads from Source Cooperative;
    // spatial converts the GeoParquet geometry into browser-ready GeoJSON.
    await connection.run('INSTALL httpfs')
    await connection.run('LOAD httpfs')
    await connection.run('INSTALL spatial')
    await connection.run('LOAD spatial')
    await connection.run("SET enable_progress_bar = false")
    return connection
  })()

  try {
    return await gbaConnectionPromise
  } catch (error) {
    gbaConnectionPromise = null
    throw error
  }
}

function gbaQueryCachePath(bounds: Bounds): string {
  const key = JSON.stringify(
    Object.fromEntries(
      Object.entries(bounds).map(([name, value]) => [name, value.toFixed(5)]),
    ),
  )
  const digest = createHash('sha1').update(key).digest('hex')
  return path.join(GBA_CACHE_ROOT, `query-${digest}.json`)
}

function gbaSql(bounds: Bounds, geometryExpression: string): string {
  const limit = MAX_RETURNED_FEATURES + 1
  return `
    SELECT
      ${geometryExpression} AS geometry_json,
      CAST(height AS DOUBLE) AS height,
      CAST("var" AS DOUBLE) AS variance,
      CAST("source" AS VARCHAR) AS source,
      CAST("id" AS VARCHAR) AS source_id
    FROM read_parquet('${GBA_TILE_URL}')
    WHERE bbox.xmin <= ${bounds.east}
      AND bbox.xmax >= ${bounds.west}
      AND bbox.ymin <= ${bounds.north}
      AND bbox.ymax >= ${bounds.south}
      AND height IS NOT NULL
      AND height BETWEEN 1.5 AND 500
    LIMIT ${limit}
  `
}

async function queryGbaRows(bounds: Bounds): Promise<GbaQueryRow[]> {
  const connection = await gbaConnection()
  const expressions = [
    'ST_AsGeoJSON(geometry)',
    'ST_AsGeoJSON(ST_GeomFromWKB(geometry))',
  ]
  let lastError: unknown = null

  for (const expression of expressions) {
    try {
      const reader = await connection.runAndReadAll(gbaSql(bounds, expression))
      return reader.getRowObjectsJson() as GbaQueryRow[]
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('GlobalBuildingAtlas geometry could not be decoded.')
}

function parseGbaGeometry(value: string | null | undefined): BuildingGeometry | null {
  if (!value) return null
  try {
    const geometry = JSON.parse(value) as {
      type?: string
      coordinates?: unknown[]
    }
    if (
      (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') &&
      Array.isArray(geometry.coordinates)
    ) {
      return geometry as BuildingGeometry
    }
  } catch {
    return null
  }
  return null
}

async function buildGbaCandidateResponse(
  bounds: Bounds,
): Promise<GbaCandidateResponse> {
  await mkdir(GBA_CACHE_ROOT, { recursive: true })
  const cachedPath = gbaQueryCachePath(bounds)

  if (await fileExists(cachedPath)) {
    const cached = JSON.parse(
      await readFile(cachedPath, 'utf8'),
    ) as GbaCandidateResponse
    cached.metadata.cachedQuery = true
    return cached
  }

  const queryKey = cachedPath
  const active = activeGbaQueries.get(queryKey)
  if (active) return active

  const query = (async (): Promise<GbaCandidateResponse> => {
    const rows = await queryGbaRows(bounds)
    if (rows.length > MAX_RETURNED_FEATURES) {
      throw new Error(
        'The selected area contains too many GlobalBuildingAtlas candidates. Use a smaller study boundary.',
      )
    }

    const features: GbaCandidateFeature[] = []
    for (const row of rows) {
      const height = finiteNumber(row.height)
      const geometry = parseGbaGeometry(row.geometry_json)
      if (height === null || height < 1.5 || height > 500 || !geometry) {
        continue
      }

      features.push({
        type: 'Feature',
        properties: {
          height,
          variance: finiteNumber(row.variance),
          source: row.source ?? null,
          sourceId:
            row.source_id === null || row.source_id === undefined
              ? null
              : String(row.source_id),
        },
        geometry,
      })
    }

    const result: GbaCandidateResponse = {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'GlobalBuildingAtlas LoD1',
        queriedTile: GBA_TILE_NAME,
        returnedFeatures: features.length,
        cachedQuery: false,
        licence: 'CC BY-NC 4.0',
      },
    }

    await writeFile(cachedPath, JSON.stringify(result), 'utf8')
    return result
  })()

  activeGbaQueries.set(queryKey, query)
  try {
    return await query
  } finally {
    activeGbaQueries.delete(queryKey)
  }
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}


function gbaHeightMiddleware(): Middleware {
  return async (request, response, next) => {
    if (!request.url?.startsWith('/api/gba-heights')) {
      next()
      return
    }

    try {
      const url = new URL(request.url, 'http://localhost')
      const bounds = parseBounds(url)
      const result = await buildGbaCandidateResponse(bounds)
      sendJson(response, 200, result)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'GlobalBuildingAtlas enrichment failed.'
      const status =
        message.includes('too large') || message.includes('too many') ? 413 : 500
      console.error('[STÉGI GlobalBuildingAtlas service]', error)
      sendJson(response, status, { error: message })
    }
  }
}

function microsoftHeightMiddleware(): Middleware {
  return async (request, response, next) => {
    if (!request.url?.startsWith('/api/microsoft-heights')) {
      next()
      return
    }

    try {
      const url = new URL(request.url, 'http://localhost')
      const bounds = parseBounds(url)
      const result = await buildCandidateResponse(bounds)
      sendJson(response, 200, result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Height enrichment failed.'
      const status = message.includes('too large') || message.includes('too many') ? 413 : 500
      console.error('[STÉGI height service]', error)
      sendJson(response, status, { error: message })
    }
  }
}

function stegiHeightService(): Plugin {
  return {
    name: 'stegi-external-height-services',
    configureServer(server) {
      server.middlewares.use(gbaHeightMiddleware())
      server.middlewares.use(microsoftHeightMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(gbaHeightMiddleware())
      server.middlewares.use(microsoftHeightMiddleware())
    },
  }
}

export default defineConfig({
  plugins: [stegiHeightService()],
})
