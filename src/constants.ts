// Numbers that turn a rooftop into cooling (°C) and cost (€).
//
// IMPORTANT: these are ILLUSTRATIVE estimates for a workshop prototype, not
// certified engineering figures. OSM has no reliable building-height data,
// so everything downstream is an approximation. The UI says so too.

export type GreenType = 'PARK' | 'GARDEN'

// How much a single square metre of each green type cools the area around
// it, in °C. Parks use intensive planting → more cooling per m². Kept small
// so neighbourhood totals land in a believable single-digit range.
export const COOLING_C_PER_M2: Record<GreenType, number> = {
  PARK: 0.00009,
  GARDEN: 0.00005,
}

// Rough build cost per square metre, in €. Parks (intensive, accessible)
// cost more than gardens (light, extensive planting). Note the two types
// have DIFFERENT cost-per-°C, so ranking by €/°C actually means something.
export const COST_EUR_PER_M2: Record<GreenType, number> = {
  PARK: 200,
  GARDEN: 90,
}

// Rooftops smaller than this (m²) are too small to be worth greening.
export const MIN_ROOF_AREA_M2 = 60

// Map colours (kept in sync with docs/frontend.md).
export const COLORS = {
  PARK: '#1b5e20',
  GARDEN: '#8bc34a',
  BEFORE: '#9e9e9e', // grey — ungreened / "no change"
  SELECTED: '#212121', // outline for the selected rooftop
}
