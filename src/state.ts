// The app's one shared state. Everything flows one way:
// boundary → rooftops → features → clusters → green type → cooling/cost.
// Nothing upstream is ever rewritten.

import type { GreenType } from './constants'
import type { HeightConfidence, HeightMatchMethod, HeightSource } from './height'

export type MapDisplayMode = 'proposal' | 'height' | 'height-confidence'

// One detected rooftop, with everything we compute about it.
export interface Rooftop {
  id: number

  // The footprint as GeoJSON (lon, lat rings), used for drawing + geometry.
  polygon: GeoJSON.Feature<GeoJSON.Polygon>

  // OpenStreetMap identity and source attributes retained for traceability.
  osmId: number | null
  osmTags: Record<string, string>

  // Feature vector (the numbers the clustering uses):
  area: number // m²
  aspectRatio: number // long side / short side
  orientation: number // 0–180°, bearing of the longest edge
  density: number // number of neighbouring buildings within 60 m
  distanceToGreen: number // metres to nearest existing green space
  heatProxy: number // simple urban-heat estimate (higher = hotter)

  // Height / relative Z above local ground.
  heightM: number | null
  buildingLevels: number | null
  roofHeightM: number | null
  roofLevels: number | null
  heightSource: HeightSource
  heightConfidence: HeightConfidence
  heightMatchScore: number | null
  heightMatchMethod: HeightMatchMethod | null
  heightMatchCandidates: number | null
  heightDatasetConfidence: number | null
  heightDatasetVariance: number | null
  heightDatasetSource: string | null
  heightDatasetId: string | null
  heightInferenceNeighbours: number | null

  // Results:
  cluster: number // which typology this roof belongs to
  greenType: GreenType // PARK or GARDEN
  coolingC: number // °C cooling this roof contributes
  costEur: number // € to build it
}

export interface AppState {
  boundary: [number, number][] // polygon vertices [lat, lng] being drawn
  rooftops: Rooftop[]
  selectedId: number | null
  showAfter: boolean // before/after toggle for the proposal view
  filter: string // sidebar search text
  mapDisplay: MapDisplayMode
}

export const state: AppState = {
  boundary: [],
  rooftops: [],
  selectedId: null,
  showAfter: true,
  filter: '',
  mapDisplay: 'proposal',
}
