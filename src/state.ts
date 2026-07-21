// The app's one shared state. Everything flows one way:
// boundary → rooftops → features → clusters → green type → cooling/cost.
// Nothing upstream is ever rewritten.

import type { GreenType } from './constants'

// One detected rooftop, with everything we compute about it.
export interface Rooftop {
  id: number
  // The footprint as GeoJSON (lon, lat rings), used for drawing + geometry.
  polygon: GeoJSON.Feature<GeoJSON.Polygon>
  // Feature vector (the numbers the clustering uses):
  area: number // m²
  aspectRatio: number // long side / short side
  orientation: number // 0–180°, bearing of the longest edge
  density: number // number of neighbouring buildings within 60 m
  distanceToGreen: number // metres to nearest existing green space
  heatProxy: number // simple urban-heat estimate (higher = hotter)
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
  showAfter: boolean // before/after toggle (false = grey "before")
  filter: string // sidebar search text
}

export const state: AppState = {
  boundary: [],
  rooftops: [],
  selectedId: null,
  showAfter: true,
  filter: '',
}
