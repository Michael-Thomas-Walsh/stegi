import * as turf from '@turf/turf'
import type { HeightMatchMethod, HeightSource } from './height'
import type { Rooftop } from './state'

interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

interface ExternalHeightProperties {
  height: number
  confidence?: number | null
  variance?: number | null
  source?: string | null
  sourceId?: string | null
}

interface ExternalHeightResponse {
  type: 'FeatureCollection'
  features: Array<
    GeoJSON.Feature<
      GeoJSON.Polygon | GeoJSON.MultiPolygon,
      ExternalHeightProperties
    >
  >
  metadata: {
    source: string
    returnedFeatures: number
    cachedQuery: boolean
    queriedTile?: string
    queriedTiles?: string[]
  }
}

interface IndexedCandidate {
  polygon: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
  bbox: Bounds
  areaM2: number
  centroid: [number, number]
  heightM: number
  footprintConfidence: number | null
  variance: number | null
  datasetSource: string | null
  datasetId: string | null
  osmId: number | null
}

interface CandidateIndex {
  candidates: IndexedCandidate[]
  grid: Map<string, number[]>
  osmIds: Map<number, number[]>
}

interface WeightedCandidate {
  candidate: IndexedCandidate
  weight: number
}

interface AggregatedCandidateData {
  heightM: number
  footprintConfidence: number | null
  variance: number | null
  datasetSource: string | null
  datasetId: string | null
  count: number
}

export type HeightEnrichmentStage =
  | 'gba-requesting'
  | 'gba-matching'
  | 'microsoft-requesting'
  | 'microsoft-matching'
  | 'estimating'
  | 'complete'
  | 'warning'

export interface HeightEnrichmentProgress {
  stage: HeightEnrichmentStage
  message: string
  progress: number
}

export type HeightEnrichmentCallback = (
  event: HeightEnrichmentProgress,
) => void

export interface HeightEnrichmentOptions {
  useNeighbourhoodEstimates?: boolean
}

export interface HeightMatchBreakdown {
  centroidWithinExternal: number
  directOsmId: number
  oneToOneOverlap: number
  areaWeightedOverlap: number
  centroidContainment: number
  gridSampledLod1: number
  bufferedProximity: number
}

export interface HeightEnrichmentSummary {
  requestedGlobalBuildingAtlas: boolean
  globalBuildingAtlasCandidates: number
  globalBuildingAtlasMatches: number
  globalBuildingAtlasMethods: HeightMatchBreakdown
  globalBuildingAtlasCachedQuery: boolean
  globalBuildingAtlasWarning: string | null
  requestedMicrosoft: boolean
  microsoftCandidates: number
  microsoftMatches: number
  microsoftMethods: HeightMatchBreakdown
  microsoftCachedQuery: boolean
  microsoftWarning: string | null
  neighbourhoodEstimates: number
  remainingMissing: number
}

const QUERY_PADDING_DEGREES = 0.0005
const MATCH_GRID_DEGREES = 0.002
const NEIGHBOUR_GRID_DEGREES = 0.0025
const NEIGHBOUR_RADIUS_M = 260
const MIN_NEIGHBOURS = 3
const MAX_NEIGHBOURS = 12
const BUFFER_DISTANCE_M = 8
const MAX_GRID_SAMPLES = 81
const NOMINAL_GRID_SPACING_M = 3

function emptyBreakdown(): HeightMatchBreakdown {
  return {
    centroidWithinExternal: 0,
    directOsmId: 0,
    oneToOneOverlap: 0,
    areaWeightedOverlap: 0,
    centroidContainment: 0,
    gridSampledLod1: 0,
    bufferedProximity: 0,
  }
}

function breakdownTotal(breakdown: HeightMatchBreakdown): number {
  return Object.values(breakdown).reduce((sum, value) => sum + value, 0)
}

function finiteHeight(value: unknown): number | null {
  const height =
    typeof value === 'number' ? value : Number.parseFloat(String(value))
  return Number.isFinite(height) && height >= 1.5 && height <= 500
    ? height
    : null
}

function finiteOptional(value: unknown): number | null {
  const parsed =
    typeof value === 'number' ? value : Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function featureBounds(
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
): Bounds {
  const [west, south, east, north] = turf.bbox(feature)
  return { west, south, east, north }
}

function paddedStudyBounds(rooftops: Rooftop[]): Bounds {
  const collection = turf.featureCollection(
    rooftops.map((rooftop) => rooftop.polygon),
  )
  const [west, south, east, north] = turf.bbox(collection)
  return {
    west: west - QUERY_PADDING_DEGREES,
    south: south - QUERY_PADDING_DEGREES,
    east: east + QUERY_PADDING_DEGREES,
    north: north + QUERY_PADDING_DEGREES,
  }
}

function cellRange(bounds: Bounds, size: number): [number, number, number, number] {
  return [
    Math.floor(bounds.west / size),
    Math.floor(bounds.south / size),
    Math.floor(bounds.east / size),
    Math.floor(bounds.north / size),
  ]
}

function cellKey(x: number, y: number): string {
  return `${x}:${y}`
}

function addToGrid(
  grid: Map<string, number[]>,
  index: number,
  bounds: Bounds,
  cellSize: number,
): void {
  const [minX, minY, maxX, maxY] = cellRange(bounds, cellSize)
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      const key = cellKey(x, y)
      const entries = grid.get(key)
      if (entries) entries.push(index)
      else grid.set(key, [index])
    }
  }
}

function candidateIndexes(
  grid: Map<string, number[]>,
  bounds: Bounds,
  cellSize: number,
): number[] {
  const found = new Set<number>()
  const [minX, minY, maxX, maxY] = cellRange(bounds, cellSize)
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (const index of grid.get(cellKey(x, y)) ?? []) found.add(index)
    }
  }
  return [...found]
}

function pointCandidateIndexes(
  grid: Map<string, number[]>,
  coordinate: [number, number],
  cellSize: number,
): number[] {
  const x = Math.floor(coordinate[0] / cellSize)
  const y = Math.floor(coordinate[1] / cellSize)
  return grid.get(cellKey(x, y)) ?? []
}

function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return !(
    a.east < b.west ||
    a.west > b.east ||
    a.north < b.south ||
    a.south > b.north
  )
}

function centroidOf(
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
): [number, number] {
  return turf.centroid(feature).geometry.coordinates as [number, number]
}

function safeIntersectionArea(
  a: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  b: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
): number {
  try {
    const intersection = turf.intersect(turf.featureCollection([a, b]))
    return intersection ? turf.area(intersection) : 0
  } catch {
    return 0
  }
}

function safePointInPolygon(
  point: [number, number],
  polygon: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
): boolean {
  try {
    return turf.booleanPointInPolygon(turf.point(point), polygon)
  } catch {
    return false
  }
}

function safeBuffer(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  distanceM: number,
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  try {
    return turf.buffer(polygon, distanceM, { units: 'meters' }) ?? null
  } catch {
    return null
  }
}

function candidateOsmId(source: string | null, datasetId: string | null): number | null {
  if (!datasetId) return null
  if (source && source.toLowerCase() !== 'osm' && !/^osm/i.test(datasetId)) {
    return null
  }
  const match = datasetId.match(/^osm(\d+)/i)
  if (!match) return null
  const parsed = Number.parseInt(match[1], 10)
  return Number.isSafeInteger(parsed) ? parsed : null
}

async function fetchExternalCandidates(
  endpoint: '/api/gba-heights' | '/api/microsoft-heights',
  rooftops: Rooftop[],
): Promise<ExternalHeightResponse> {
  const bounds = paddedStudyBounds(rooftops)
  const params = new URLSearchParams({
    west: bounds.west.toFixed(7),
    south: bounds.south.toFixed(7),
    east: bounds.east.toFixed(7),
    north: bounds.north.toFixed(7),
  })

  const response = await fetch(`${endpoint}?${params.toString()}`)
  const body = (await response.json()) as
    | ExternalHeightResponse
    | { error?: string }

  if (!response.ok) {
    const message =
      'error' in body && body.error
        ? body.error
        : `Height service returned HTTP ${response.status}.`
    throw new Error(message)
  }

  return body as ExternalHeightResponse
}

function indexCandidates(response: ExternalHeightResponse): CandidateIndex {
  const candidates: IndexedCandidate[] = []
  const grid = new Map<string, number[]>()
  const osmIds = new Map<number, number[]>()

  for (const feature of response.features) {
    const heightM = finiteHeight(feature.properties?.height)
    if (heightM === null) continue

    const polygon: GeoJSON.Feature<
      GeoJSON.Polygon | GeoJSON.MultiPolygon
    > = {
      type: 'Feature',
      properties: {},
      geometry: feature.geometry,
    }

    let areaM2: number
    try {
      areaM2 = turf.area(polygon)
    } catch {
      continue
    }
    if (!Number.isFinite(areaM2) || areaM2 < 4) continue

    const datasetSource = feature.properties?.source ?? null
    const datasetId = feature.properties?.sourceId ?? null
    const candidate: IndexedCandidate = {
      polygon,
      bbox: featureBounds(polygon),
      areaM2,
      centroid: centroidOf(polygon),
      heightM,
      footprintConfidence: finiteOptional(feature.properties?.confidence),
      variance: finiteOptional(feature.properties?.variance),
      datasetSource,
      datasetId,
      osmId: candidateOsmId(datasetSource, datasetId),
    }

    const index = candidates.length
    candidates.push(candidate)
    addToGrid(grid, index, candidate.bbox, MATCH_GRID_DEGREES)

    if (candidate.osmId !== null) {
      const entries = osmIds.get(candidate.osmId)
      if (entries) entries.push(index)
      else osmIds.set(candidate.osmId, [index])
    }
  }

  return { candidates, grid, osmIds }
}

function weightedMedian(values: Array<{ value: number; weight: number }>): number {
  const filtered = values
    .filter(({ value, weight }) => Number.isFinite(value) && weight > 0)
    .sort((a, b) => a.value - b.value)
  if (filtered.length === 0) return Number.NaN

  const total = filtered.reduce((sum, item) => sum + item.weight, 0)
  let running = 0
  for (const item of filtered) {
    running += item.weight
    if (running >= total / 2) return item.value
  }
  return filtered[filtered.length - 1].value
}

function weightedMean(
  values: Array<{ value: number | null; weight: number }>,
): number | null {
  const filtered = values.filter(
    (item): item is { value: number; weight: number } =>
      item.value !== null && Number.isFinite(item.value) && item.weight > 0,
  )
  if (filtered.length === 0) return null
  const totalWeight = filtered.reduce((sum, item) => sum + item.weight, 0)
  return (
    filtered.reduce((sum, item) => sum + item.value * item.weight, 0) /
    totalWeight
  )
}

function aggregateCandidates(entries: WeightedCandidate[]): AggregatedCandidateData {
  const heightM = weightedMedian(
    entries.map(({ candidate, weight }) => ({ value: candidate.heightM, weight })),
  )
  const sources = [
    ...new Set(
      entries
        .map(({ candidate }) => candidate.datasetSource)
        .filter((value): value is string => Boolean(value)),
    ),
  ]
  const ids = entries
    .map(({ candidate }) => candidate.datasetId)
    .filter((value): value is string => Boolean(value))

  return {
    heightM,
    footprintConfidence: weightedMean(
      entries.map(({ candidate, weight }) => ({
        value: candidate.footprintConfidence,
        weight,
      })),
    ),
    variance: weightedMean(
      entries.map(({ candidate, weight }) => ({
        value: candidate.variance,
        weight,
      })),
    ),
    datasetSource:
      sources.length === 0 ? null : sources.length === 1 ? sources[0] : 'mixed',
    datasetId:
      ids.length === 0
        ? null
        : ids.length <= 3
          ? ids.join(', ')
          : `${ids.slice(0, 3).join(', ')} +${ids.length - 3} more`,
    count: entries.length,
  }
}

function assignExternalHeight(
  rooftop: Rooftop,
  entries: WeightedCandidate[],
  source: Extract<HeightSource, 'global-building-atlas' | 'microsoft-ml'>,
  method: HeightMatchMethod,
  score: number,
): void {
  const aggregate = aggregateCandidates(entries)
  if (!Number.isFinite(aggregate.heightM)) return

  rooftop.heightM = aggregate.heightM
  rooftop.heightSource = source
  rooftop.heightConfidence = method === 'buffered-proximity' ? 'low' : 'medium'
  rooftop.heightMatchScore = Math.max(0, Math.min(1, score))
  rooftop.heightMatchMethod = method
  rooftop.heightMatchCandidates = aggregate.count
  rooftop.heightDatasetConfidence = aggregate.footprintConfidence
  rooftop.heightDatasetVariance = aggregate.variance
  rooftop.heightDatasetSource = aggregate.datasetSource
  rooftop.heightDatasetId = aggregate.datasetId
  rooftop.heightInferenceNeighbours = null
}

function oneToOneScore(
  rooftop: Rooftop,
  candidate: IndexedCandidate,
  intersectionArea: number,
): number {
  const smallerArea = Math.min(rooftop.area, candidate.areaM2)
  const largerArea = Math.max(rooftop.area, candidate.areaM2)
  const areaSimilarity = largerArea > 0 ? smallerArea / largerArea : 0
  if (intersectionArea <= 0) return 0

  const unionArea = rooftop.area + candidate.areaM2 - intersectionArea
  const iou = unionArea > 0 ? intersectionArea / unionArea : 0
  const roofCoverage = intersectionArea / Math.max(rooftop.area, 1)
  const candidateCoverage = intersectionArea / Math.max(candidate.areaM2, 1)

  if (iou < 0.12 && !(roofCoverage >= 0.4 && candidateCoverage >= 0.2)) {
    return 0
  }

  return Math.min(
    1,
    iou * 0.5 +
      Math.min(roofCoverage, candidateCoverage) * 0.3 +
      areaSimilarity * 0.2,
  )
}

/**
 * Reproduce the high-performing Colab test directly in the browser:
 * take each OSM rooftop centroid and transfer the height from the external
 * footprint that contains that point. This runs before overlap scoring and
 * deliberately does not cap the number of candidates in a dense grid cell.
 */
function applyCentroidWithinExternalMatches(
  rooftops: Rooftop[],
  index: CandidateIndex,
  source: Extract<HeightSource, 'global-building-atlas' | 'microsoft-ml'>,
): number {
  let matched = 0

  for (const rooftop of rooftops) {
    if (rooftop.heightM !== null) continue

    const roofCentroid = centroidOf(rooftop.polygon)
    const containing = pointCandidateIndexes(
      index.grid,
      roofCentroid,
      MATCH_GRID_DEGREES,
    )
      .map((candidateIndex) => index.candidates[candidateIndex])
      .filter((candidate) => safePointInPolygon(roofCentroid, candidate.polygon))

    if (containing.length === 0) continue

    // A centroid can occasionally fall inside nested/overlapping source
    // polygons. Prefer the most specific footprint, then the lowest supplied
    // prediction variance for a stable, deterministic match.
    containing.sort((a, b) => {
      const areaDifference = a.areaM2 - b.areaM2
      if (Math.abs(areaDifference) > 0.01) return areaDifference
      return (a.variance ?? Number.POSITIVE_INFINITY) -
        (b.variance ?? Number.POSITIVE_INFINITY)
    })

    const candidate = containing[0]
    assignExternalHeight(
      rooftop,
      [{ candidate, weight: 1 }],
      source,
      'osm-centroid-within-external',
      1,
    )
    matched += 1
  }

  return matched
}

function applyDirectOsmIdMatches(
  rooftops: Rooftop[],
  index: CandidateIndex,
  source: Extract<HeightSource, 'global-building-atlas' | 'microsoft-ml'>,
): number {
  let matched = 0
  for (const rooftop of rooftops) {
    if (rooftop.heightM !== null || rooftop.osmId === null) continue
    const candidateIds = index.osmIds.get(rooftop.osmId) ?? []
    if (candidateIds.length === 0) continue

    const entries = candidateIds.map((candidateIndex) => ({
      candidate: index.candidates[candidateIndex],
      weight: Math.max(index.candidates[candidateIndex].areaM2, 1),
    }))
    assignExternalHeight(rooftop, entries, source, 'direct-osm-id', 1)
    matched += 1
  }
  return matched
}

function applyOverlapAndCentroidMatches(
  rooftops: Rooftop[],
  index: CandidateIndex,
  source: Extract<HeightSource, 'global-building-atlas' | 'microsoft-ml'>,
  minimumOneToOneScore: number,
  breakdown: HeightMatchBreakdown,
): void {
  for (const rooftop of rooftops) {
    if (rooftop.heightM !== null) continue

    const roofBounds = featureBounds(rooftop.polygon)
    const candidateIds = candidateIndexes(index.grid, roofBounds, MATCH_GRID_DEGREES)
      .filter((candidateIndex) =>
        boundsIntersect(roofBounds, index.candidates[candidateIndex].bbox),
      )
      .slice(0, 180)
    if (candidateIds.length === 0) continue

    let bestCandidate: IndexedCandidate | null = null
    let bestScore = 0
    const overlaps: WeightedCandidate[] = []
    let totalIntersection = 0

    for (const candidateId of candidateIds) {
      const candidate = index.candidates[candidateId]
      const intersectionArea = safeIntersectionArea(rooftop.polygon, candidate.polygon)
      if (intersectionArea <= 0) continue

      const score = oneToOneScore(rooftop, candidate, intersectionArea)
      if (score > bestScore) {
        bestCandidate = candidate
        bestScore = score
      }

      const roofShare = intersectionArea / Math.max(rooftop.area, 1)
      const candidateShare = intersectionArea / Math.max(candidate.areaM2, 1)
      if (intersectionArea >= 1 && (roofShare >= 0.004 || candidateShare >= 0.05)) {
        overlaps.push({ candidate, weight: intersectionArea })
        totalIntersection += intersectionArea
      }
    }

    if (bestCandidate && bestScore >= minimumOneToOneScore) {
      assignExternalHeight(
        rooftop,
        [{ candidate: bestCandidate, weight: 1 }],
        source,
        'one-to-one-overlap',
        bestScore,
      )
      breakdown.oneToOneOverlap += 1
      continue
    }

    const totalRoofCoverage = Math.min(1, totalIntersection / Math.max(rooftop.area, 1))
    if (
      overlaps.length > 0 &&
      (totalRoofCoverage >= 0.14 ||
        (overlaps.length >= 2 && totalRoofCoverage >= 0.08))
    ) {
      assignExternalHeight(
        rooftop,
        overlaps,
        source,
        'area-weighted-overlap',
        0.28 + totalRoofCoverage * 0.65,
      )
      breakdown.areaWeightedOverlap += 1
      continue
    }

    const roofCentroid = centroidOf(rooftop.polygon)
    const contained: WeightedCandidate[] = []
    let closestDistance = Number.POSITIVE_INFINITY
    let containedArea = 0

    for (const candidateId of candidateIds) {
      const candidate = index.candidates[candidateId]
      const candidateInsideRoof = safePointInPolygon(candidate.centroid, rooftop.polygon)
      const roofInsideCandidate = safePointInPolygon(roofCentroid, candidate.polygon)
      if (!candidateInsideRoof && !roofInsideCandidate) continue

      const distanceM = turf.distance(roofCentroid, candidate.centroid, {
        units: 'meters',
      })
      closestDistance = Math.min(closestDistance, distanceM)
      const weight = candidateInsideRoof
        ? Math.max(candidate.areaM2, 1)
        : Math.max(Math.min(candidate.areaM2, rooftop.area), 1)
      contained.push({ candidate, weight })
      containedArea += Math.min(candidate.areaM2, rooftop.area)
    }

    const containmentCoverage = Math.min(
      1,
      containedArea / Math.max(rooftop.area, 1),
    )
    if (
      contained.length > 0 &&
      (containmentCoverage >= 0.07 || closestDistance <= 12)
    ) {
      assignExternalHeight(
        rooftop,
        contained,
        source,
        'centroid-containment',
        0.34 + containmentCoverage * 0.45,
      )
      breakdown.centroidContainment += 1
    }
  }
}

function gridSamplePoints(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  areaM2: number,
): [number, number][] {
  const [west, south, east, north] = turf.bbox(polygon)
  const midLatitude = (south + north) / 2
  const midLongitude = (west + east) / 2
  const widthM = turf.distance([west, midLatitude], [east, midLatitude], {
    units: 'meters',
  })
  const heightM = turf.distance([midLongitude, south], [midLongitude, north], {
    units: 'meters',
  })

  const adaptiveSpacing = Math.max(
    NOMINAL_GRID_SPACING_M,
    Math.sqrt(Math.max(areaM2, 1) / MAX_GRID_SAMPLES),
  )
  const columns = Math.max(1, Math.min(20, Math.ceil(widthM / adaptiveSpacing)))
  const rows = Math.max(1, Math.min(20, Math.ceil(heightM / adaptiveSpacing)))
  const points: [number, number][] = []

  for (let row = 0; row < rows; row += 1) {
    const latitude = south + ((row + 0.5) / rows) * (north - south)
    for (let column = 0; column < columns; column += 1) {
      const longitude = west + ((column + 0.5) / columns) * (east - west)
      const coordinate: [number, number] = [longitude, latitude]
      if (safePointInPolygon(coordinate, polygon)) points.push(coordinate)
      if (points.length >= MAX_GRID_SAMPLES) return points
    }
  }

  if (points.length === 0) points.push(centroidOf(polygon))
  return points
}

function applyGridSampledMatches(
  rooftops: Rooftop[],
  index: CandidateIndex,
  source: Extract<HeightSource, 'global-building-atlas' | 'microsoft-ml'>,
  breakdown: HeightMatchBreakdown,
): void {
  for (const rooftop of rooftops) {
    if (rooftop.heightM !== null) continue

    const samples = gridSamplePoints(rooftop.polygon, rooftop.area)
    const hits = new Map<number, number>()
    let hitSamples = 0

    for (const sample of samples) {
      let sampleHit = false
      for (const candidateId of pointCandidateIndexes(
        index.grid,
        sample,
        MATCH_GRID_DEGREES,
      )) {
        const candidate = index.candidates[candidateId]
        if (!safePointInPolygon(sample, candidate.polygon)) continue
        hits.set(candidateId, (hits.get(candidateId) ?? 0) + 1)
        sampleHit = true
      }
      if (sampleHit) hitSamples += 1
    }

    const hitRatio = hitSamples / Math.max(samples.length, 1)
    if (hitSamples < 2 || hitRatio < 0.08 || hits.size === 0) continue

    const entries = [...hits.entries()].map(([candidateId, count]) => ({
      candidate: index.candidates[candidateId],
      weight: count,
    }))
    assignExternalHeight(
      rooftop,
      entries,
      source,
      'grid-sampled-lod1',
      0.24 + hitRatio * 0.68,
    )
    breakdown.gridSampledLod1 += 1
  }
}

function applyBufferedMatches(
  rooftops: Rooftop[],
  index: CandidateIndex,
  source: Extract<HeightSource, 'global-building-atlas' | 'microsoft-ml'>,
  breakdown: HeightMatchBreakdown,
): void {
  for (const rooftop of rooftops) {
    if (rooftop.heightM !== null) continue

    const buffered = safeBuffer(rooftop.polygon, BUFFER_DISTANCE_M)
    if (!buffered) continue
    const bufferBounds = featureBounds(buffered)
    const roofCentre = centroidOf(rooftop.polygon)
    const nearby: Array<WeightedCandidate & { distanceM: number }> = []

    for (const candidateId of candidateIndexes(
      index.grid,
      bufferBounds,
      MATCH_GRID_DEGREES,
    ).slice(0, 220)) {
      const candidate = index.candidates[candidateId]
      if (!boundsIntersect(bufferBounds, candidate.bbox)) continue

      const distanceM = turf.distance(roofCentre, candidate.centroid, {
        units: 'meters',
      })
      const centroidInsideBuffer = safePointInPolygon(candidate.centroid, buffered)
      if (!centroidInsideBuffer && distanceM > 13) continue

      const areaRatio =
        Math.min(rooftop.area, candidate.areaM2) /
        Math.max(rooftop.area, candidate.areaM2, 1)
      if (areaRatio < 0.08) continue

      nearby.push({
        candidate,
        distanceM,
        weight: (0.25 + areaRatio) / Math.max(distanceM, 1.5),
      })
    }

    nearby.sort((a, b) => a.distanceM - b.distanceM)
    const selected = nearby.slice(0, 5)
    if (selected.length === 0 || selected[0].distanceM > 10) continue

    const areaRatio =
      Math.min(rooftop.area, selected[0].candidate.areaM2) /
      Math.max(rooftop.area, selected[0].candidate.areaM2, 1)
    const score =
      0.2 +
      Math.max(0, 1 - selected[0].distanceM / 12) * 0.2 +
      areaRatio * 0.18
    assignExternalHeight(
      rooftop,
      selected,
      source,
      'buffered-proximity',
      score,
    )
    breakdown.bufferedProximity += 1
  }
}

function applyAdvancedMatches(
  rooftops: Rooftop[],
  index: CandidateIndex,
  source: Extract<HeightSource, 'global-building-atlas' | 'microsoft-ml'>,
  minimumOneToOneScore: number,
): HeightMatchBreakdown {
  const breakdown = emptyBreakdown()
  breakdown.centroidWithinExternal = applyCentroidWithinExternalMatches(
    rooftops,
    index,
    source,
  )
  breakdown.directOsmId = applyDirectOsmIdMatches(rooftops, index, source)
  applyOverlapAndCentroidMatches(
    rooftops,
    index,
    source,
    minimumOneToOneScore,
    breakdown,
  )
  applyGridSampledMatches(rooftops, index, source, breakdown)
  applyBufferedMatches(rooftops, index, source, breakdown)
  return breakdown
}

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2
}

interface KnownHeight {
  roof: Rooftop
  centre: [number, number]
  bounds: Bounds
}

function applyNeighbourhoodEstimates(rooftops: Rooftop[]): number {
  const known: KnownHeight[] = rooftops
    .filter((roof) => roof.heightM !== null)
    .map((roof) => ({
      roof,
      centre: centroidOf(roof.polygon),
      bounds: featureBounds(roof.polygon),
    }))

  if (known.length < MIN_NEIGHBOURS) return 0

  const grid = new Map<string, number[]>()
  known.forEach((item, index) => {
    const expanded = {
      west: item.bounds.west - 0.003,
      south: item.bounds.south - 0.003,
      east: item.bounds.east + 0.003,
      north: item.bounds.north + 0.003,
    }
    addToGrid(grid, index, expanded, NEIGHBOUR_GRID_DEGREES)
  })

  let estimated = 0

  for (const rooftop of rooftops) {
    if (rooftop.heightM !== null) continue

    const centre = centroidOf(rooftop.polygon)
    const roofBounds = featureBounds(rooftop.polygon)
    const searchBounds = {
      west: roofBounds.west - 0.0032,
      south: roofBounds.south - 0.0032,
      east: roofBounds.east + 0.0032,
      north: roofBounds.north + 0.0032,
    }

    const neighbours = candidateIndexes(
      grid,
      searchBounds,
      NEIGHBOUR_GRID_DEGREES,
    )
      .map((index) => {
        const item = known[index]
        const distanceM = turf.distance(centre, item.centre, {
          units: 'meters',
        })
        const areaRatio =
          Math.min(rooftop.area, item.roof.area) /
          Math.max(rooftop.area, item.roof.area, 1)
        const sameBuildingType =
          rooftop.osmTags.building &&
          item.roof.osmTags.building === rooftop.osmTags.building

        return {
          item,
          distanceM,
          score:
            distanceM + (1 - areaRatio) * 85 - (sameBuildingType ? 35 : 0),
        }
      })
      .filter(({ distanceM }) => distanceM <= NEIGHBOUR_RADIUS_M)
      .sort((a, b) => a.score - b.score)
      .slice(0, MAX_NEIGHBOURS)

    if (neighbours.length < MIN_NEIGHBOURS) continue

    const values = neighbours
      .map(({ item }) => item.roof.heightM)
      .filter((height): height is number => height !== null)

    if (values.length < MIN_NEIGHBOURS) continue

    rooftop.heightM = median(values)
    rooftop.heightSource = 'neighbourhood-estimate'
    rooftop.heightConfidence = 'low'
    rooftop.heightMatchScore = null
    rooftop.heightMatchMethod = 'neighbourhood'
    rooftop.heightMatchCandidates = values.length
    rooftop.heightDatasetConfidence = null
    rooftop.heightDatasetVariance = null
    rooftop.heightDatasetSource = null
    rooftop.heightDatasetId = null
    rooftop.heightInferenceNeighbours = values.length
    estimated += 1
  }

  return estimated
}

function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) =>
    window.requestAnimationFrame(() => resolve()),
  )
}

function methodSummary(breakdown: HeightMatchBreakdown): string {
  const parts = [
    breakdown.centroidWithinExternal > 0
      ? `${breakdown.centroidWithinExternal} centroid-within-footprint matches`
      : '',
    breakdown.directOsmId > 0 ? `${breakdown.directOsmId} direct IDs` : '',
    breakdown.oneToOneOverlap > 0
      ? `${breakdown.oneToOneOverlap} strong overlaps`
      : '',
    breakdown.areaWeightedOverlap > 0
      ? `${breakdown.areaWeightedOverlap} weighted overlaps`
      : '',
    breakdown.centroidContainment > 0
      ? `${breakdown.centroidContainment} centroid matches`
      : '',
    breakdown.gridSampledLod1 > 0
      ? `${breakdown.gridSampledLod1} grid samples`
      : '',
    breakdown.bufferedProximity > 0
      ? `${breakdown.bufferedProximity} buffered matches`
      : '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : 'no usable matches'
}

export async function enrichMissingHeights(
  rooftops: Rooftop[],
  onProgress?: HeightEnrichmentCallback,
  options: HeightEnrichmentOptions = {},
): Promise<HeightEnrichmentSummary> {
  const missingBefore = rooftops.filter((roof) => roof.heightM === null).length
  if (missingBefore === 0) {
    return {
      requestedGlobalBuildingAtlas: false,
      globalBuildingAtlasCandidates: 0,
      globalBuildingAtlasMatches: 0,
      globalBuildingAtlasMethods: emptyBreakdown(),
      globalBuildingAtlasCachedQuery: false,
      globalBuildingAtlasWarning: null,
      requestedMicrosoft: false,
      microsoftCandidates: 0,
      microsoftMatches: 0,
      microsoftMethods: emptyBreakdown(),
      microsoftCachedQuery: false,
      microsoftWarning: null,
      neighbourhoodEstimates: 0,
      remainingMissing: 0,
    }
  }

  let globalBuildingAtlasCandidates = 0
  let globalBuildingAtlasMethods = emptyBreakdown()
  let globalBuildingAtlasCachedQuery = false
  let globalBuildingAtlasWarning: string | null = null

  onProgress?.({
    stage: 'gba-requesting',
    message:
      'Querying GlobalBuildingAtlas for satellite-derived heights inside the selected study area…',
    progress: 68,
  })

  try {
    const response = await fetchExternalCandidates('/api/gba-heights', rooftops)
    globalBuildingAtlasCandidates = response.features.length
    globalBuildingAtlasCachedQuery = response.metadata.cachedQuery

    onProgress?.({
      stage: 'gba-matching',
      message: `Running the validated OSM-centroid-within-GBA test first, then checking overlaps and fallback geometry matches against ${globalBuildingAtlasCandidates.toLocaleString()} GlobalBuildingAtlas candidates…`,
      progress: 72,
    })

    await nextFrame()
    globalBuildingAtlasMethods = applyAdvancedMatches(
      rooftops,
      indexCandidates(response),
      'global-building-atlas',
      0.24,
    )
  } catch (error) {
    globalBuildingAtlasWarning =
      error instanceof Error
        ? error.message
        : 'GlobalBuildingAtlas height enrichment failed.'
    onProgress?.({
      stage: 'warning',
      message: `${globalBuildingAtlasWarning} Continuing with the Microsoft height source…`,
      progress: 73,
    })
  }

  const globalBuildingAtlasMatches = breakdownTotal(globalBuildingAtlasMethods)
  const missingAfterGba = rooftops.filter((roof) => roof.heightM === null).length
  let microsoftCandidates = 0
  let microsoftMethods = emptyBreakdown()
  let microsoftCachedQuery = false
  let microsoftWarning: string | null = null

  if (missingAfterGba > 0) {
    onProgress?.({
      stage: 'microsoft-requesting',
      message: `Checking Microsoft imagery-derived heights for the ${missingAfterGba.toLocaleString()} remaining gaps…`,
      progress: 76,
    })

    try {
      const response = await fetchExternalCandidates(
        '/api/microsoft-heights',
        rooftops,
      )
      microsoftCandidates = response.features.length
      microsoftCachedQuery = response.metadata.cachedQuery

      onProgress?.({
        stage: 'microsoft-matching',
        message: `Running centroid-within-footprint matching first, then the remaining geometry fallbacks against ${microsoftCandidates.toLocaleString()} Microsoft candidates…`,
        progress: 79,
      })

      await nextFrame()
      microsoftMethods = applyAdvancedMatches(
        rooftops,
        indexCandidates(response),
        'microsoft-ml',
        0.28,
      )
    } catch (error) {
      microsoftWarning =
        error instanceof Error
          ? error.message
          : 'Microsoft height enrichment failed.'
      onProgress?.({
        stage: 'warning',
        message: `${microsoftWarning} Remaining footprints will stay unestimated unless the optional neighbourhood fallback is enabled.`,
        progress: 79,
      })
    }
  }

  const microsoftMatches = breakdownTotal(microsoftMethods)
  let neighbourhoodEstimates = 0
  if (options.useNeighbourhoodEstimates) {
    onProgress?.({
      stage: 'estimating',
      message:
        'Estimating the final gaps from nearby buildings. These values are marked low confidence…',
      progress: 81,
    })
    await nextFrame()
    neighbourhoodEstimates = applyNeighbourhoodEstimates(rooftops)
  }

  const remainingMissing = rooftops.filter((roof) => roof.heightM === null).length
  const fallbackText = options.useNeighbourhoodEstimates
    ? `, ${neighbourhoodEstimates.toLocaleString()} local estimates`
    : ''

  onProgress?.({
    stage: 'complete',
    message: `GlobalBuildingAtlas: ${methodSummary(globalBuildingAtlasMethods)}. Microsoft: ${methodSummary(microsoftMethods)}${fallbackText}; ${remainingMissing.toLocaleString()} footprints remain without height data.`,
    progress: 82,
  })

  return {
    requestedGlobalBuildingAtlas: true,
    globalBuildingAtlasCandidates,
    globalBuildingAtlasMatches,
    globalBuildingAtlasMethods,
    globalBuildingAtlasCachedQuery,
    globalBuildingAtlasWarning,
    requestedMicrosoft: missingAfterGba > 0,
    microsoftCandidates,
    microsoftMatches,
    microsoftMethods,
    microsoftCachedQuery,
    microsoftWarning,
    neighbourhoodEstimates,
    remainingMissing,
  }
}
