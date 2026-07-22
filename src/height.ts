import type { Rooftop } from './state'

export type HeightSource =
  | 'osm-height'
  | 'osm-levels'
  | 'global-building-atlas'
  | 'microsoft-ml'
  | 'neighbourhood-estimate'
  | 'missing'
export type HeightConfidence = 'high' | 'medium' | 'low' | 'none'

export type HeightMatchMethod =
  | 'osm-centroid-within-external'
  | 'direct-osm-id'
  | 'one-to-one-overlap'
  | 'area-weighted-overlap'
  | 'centroid-containment'
  | 'grid-sampled-lod1'
  | 'buffered-proximity'
  | 'neighbourhood'


export interface BuildingHeightData {
  heightM: number | null
  levels: number | null
  roofHeightM: number | null
  roofLevels: number | null
  source: HeightSource
  confidence: HeightConfidence
}

const DEFAULT_STOREY_HEIGHT_M = 3
const DEFAULT_ROOF_LEVEL_HEIGHT_M = 2.4
const MIN_REASONABLE_HEIGHT_M = 1.5
const MAX_REASONABLE_HEIGHT_M = 500
const MAX_REASONABLE_LEVELS = 120

function finiteWithin(value: number, min: number, max: number): number | null {
  return Number.isFinite(value) && value >= min && value <= max ? value : null
}

function normaliseNumber(value: string): number | null {
  const cleaned = value.trim().replace(',', '.')
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(cleaned)) return null
  return Number.parseFloat(cleaned)
}

/**
 * Parse the common OSM forms used for height values: `12`, `12 m`, `12.5m`
 * and feet. Ambiguous lists/ranges are deliberately rejected rather than
 * presenting false precision.
 */
export function parseHeightMetres(raw: string | undefined): number | null {
  if (!raw) return null

  const value = raw.trim().toLowerCase()
  if (!value || /[;–—]/.test(value)) return null

  const feetMatch = value.match(/^([+-]?\d+(?:[.,]\d+)?)\s*(?:ft|feet|foot)$/)
  if (feetMatch) {
    const feet = normaliseNumber(feetMatch[1])
    if (feet === null) return null
    return finiteWithin(
      feet * 0.3048,
      MIN_REASONABLE_HEIGHT_M,
      MAX_REASONABLE_HEIGHT_M,
    )
  }

  const metreMatch = value.match(
    /^([+-]?\d+(?:[.,]\d+)?)\s*(?:m|metre|metres|meter|meters)?$/,
  )
  if (!metreMatch) return null

  const metres = normaliseNumber(metreMatch[1])
  if (metres === null) return null
  return finiteWithin(
    metres,
    MIN_REASONABLE_HEIGHT_M,
    MAX_REASONABLE_HEIGHT_M,
  )
}

export function parseLevels(raw: string | undefined): number | null {
  if (!raw) return null
  const value = normaliseNumber(raw)
  if (value === null) return null
  return finiteWithin(value, 0.5, MAX_REASONABLE_LEVELS)
}

export function deriveBuildingHeight(
  tags: Record<string, string>,
): BuildingHeightData {
  const explicitHeight = parseHeightMetres(tags.height)
  const levels = parseLevels(tags['building:levels'])
  const roofHeightM = parseHeightMetres(tags['roof:height'])
  const roofLevels = parseLevels(tags['roof:levels'])

  if (explicitHeight !== null) {
    return {
      heightM: explicitHeight,
      levels,
      roofHeightM,
      roofLevels,
      source: 'osm-height',
      confidence: 'high',
    }
  }

  if (levels !== null) {
    const roofAllowance =
      roofHeightM ??
      (roofLevels !== null ? roofLevels * DEFAULT_ROOF_LEVEL_HEIGHT_M : 0)
    const estimated = levels * DEFAULT_STOREY_HEIGHT_M + roofAllowance

    return {
      heightM: finiteWithin(
        estimated,
        MIN_REASONABLE_HEIGHT_M,
        MAX_REASONABLE_HEIGHT_M,
      ),
      levels,
      roofHeightM,
      roofLevels,
      source: 'osm-levels',
      confidence: 'medium',
    }
  }

  return {
    heightM: null,
    levels,
    roofHeightM,
    roofLevels,
    source: 'missing',
    confidence: 'none',
  }
}

export function heightSourceLabel(source: HeightSource): string {
  if (source === 'osm-height') return 'OSM height tag'
  if (source === 'osm-levels') return 'Estimated from OSM levels'
  if (source === 'global-building-atlas') {
    return 'GlobalBuildingAtlas satellite-derived height'
  }
  if (source === 'microsoft-ml') return 'Microsoft imagery-derived height'
  if (source === 'neighbourhood-estimate') {
    return 'Estimated from nearby buildings'
  }
  return 'No height data'
}


export function heightMatchMethodLabel(
  method: HeightMatchMethod | null,
): string {
  if (method === 'osm-centroid-within-external') {
    return 'OSM footprint centroid within external building footprint'
  }
  if (method === 'direct-osm-id') return 'Direct OSM ID link'
  if (method === 'one-to-one-overlap') return 'Strong one-to-one overlap'
  if (method === 'area-weighted-overlap') return 'Area-weighted multi-footprint overlap'
  if (method === 'centroid-containment') return 'Centroid containment'
  if (method === 'grid-sampled-lod1') return '3 m-style LoD1 grid sampling'
  if (method === 'buffered-proximity') return 'Buffered proximity match'
  if (method === 'neighbourhood') return 'Nearby-building estimate'
  return 'Not applicable'
}

export function heightConfidenceLabel(confidence: HeightConfidence): string {
  if (confidence === 'high') return 'High'
  if (confidence === 'medium') return 'Medium'
  if (confidence === 'low') return 'Low'
  return 'Unavailable'
}

export function globalBuildingAtlasSourceLabel(
  source: string | null,
): string {
  if (!source) return 'Not supplied'
  if (source === 'osm') return 'OpenStreetMap-derived footprint'
  if (source === 'ms') return 'Microsoft-derived footprint'
  if (source === 'google') return 'Google Open Buildings footprint'
  if (source === 'ours2') return 'TUM satellite-derived footprint'
  if (source === '3dglobfp') return '3D Global Footprints source'
  return source
}

export const HEIGHT_LEGEND_BINS = [
  { max: 6, label: '0–6 m', colour: '#dceff4' },
  { max: 12, label: '6–12 m', colour: '#a9d4df' },
  { max: 18, label: '12–18 m', colour: '#70b4c6' },
  { max: 30, label: '18–30 m', colour: '#367f9a' },
  { max: Number.POSITIVE_INFINITY, label: '30 m+', colour: '#17475d' },
] as const

export function heightColour(heightM: number | null): string {
  if (heightM === null) return '#b8bab8'
  return (
    HEIGHT_LEGEND_BINS.find((bin) => heightM < bin.max)?.colour ?? '#17475d'
  )
}

export function confidenceColour(confidence: HeightConfidence): string {
  if (confidence === 'high') return '#2f6f45'
  if (confidence === 'medium') return '#d18a32'
  if (confidence === 'low') return '#7f6aa5'
  return '#a6a8a6'
}

export interface HeightSummary {
  total: number
  explicit: number
  estimated: number
  globalBuildingAtlas: number
  microsoft: number
  inferred: number
  missing: number
  known: number
  coveragePercent: number
  averageKnownM: number | null
  medianKnownM: number | null
}

export function summariseHeights(rooftops: Rooftop[]): HeightSummary {
  const explicit = rooftops.filter(
    (roof) => roof.heightSource === 'osm-height',
  ).length
  const estimated = rooftops.filter(
    (roof) => roof.heightSource === 'osm-levels',
  ).length
  const globalBuildingAtlas = rooftops.filter(
    (roof) => roof.heightSource === 'global-building-atlas',
  ).length
  const microsoft = rooftops.filter(
    (roof) => roof.heightSource === 'microsoft-ml',
  ).length
  const inferred = rooftops.filter(
    (roof) => roof.heightSource === 'neighbourhood-estimate',
  ).length
  const missing = rooftops.filter(
    (roof) => roof.heightSource === 'missing',
  ).length
  const values = rooftops
    .map((roof) => roof.heightM)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)

  const known = values.length
  const averageKnownM = known
    ? values.reduce((sum, value) => sum + value, 0) / known
    : null
  const medianKnownM = known
    ? values.length % 2 === 1
      ? values[Math.floor(values.length / 2)]
      : (values[values.length / 2 - 1] + values[values.length / 2]) / 2
    : null

  return {
    total: rooftops.length,
    explicit,
    estimated,
    globalBuildingAtlas,
    microsoft,
    inferred,
    missing,
    known,
    coveragePercent: rooftops.length ? (known / rooftops.length) * 100 : 0,
    averageKnownM,
    medianKnownM,
  }
}
