// Turns each greened rooftop into its two headline numbers: how much it
// cools (°C) and what it costs (€). Also totals them for the neighbourhood.
//
// Numbers come from src/constants.ts and are ILLUSTRATIVE estimates.

import type { Rooftop } from './state'
import { COOLING_C_PER_M2, COST_EUR_PER_M2 } from './constants'

// Fills in coolingC and costEur for each roof. Mutates in place.
//
// Cooling is scaled by a "context factor": a roof in a hotter, greener-
// starved spot delivers more cooling benefit than the same roof somewhere
// already cool and leafy. This is what makes ranking by €/°C useful — it
// surfaces the roofs where each euro buys the most cooling.
export function computeCoolingAndCost(rooftops: Rooftop[]): void {
  const maxHeat = Math.max(...rooftops.map((r) => r.heatProxy), 1)
  for (const r of rooftops) {
    const contextFactor = 0.5 + r.heatProxy / maxHeat // 0.5 … 1.5
    r.coolingC = r.area * COOLING_C_PER_M2[r.greenType] * contextFactor
    r.costEur = r.area * COST_EUR_PER_M2[r.greenType]
  }
}

// The live tally shown in the sidebar, computed over a set of roofs.
export interface Totals {
  count: number
  greenM2: number
  coolingC: number
  costEur: number
  eurPerC: number // cost-effectiveness (lower is better)
}

export function totalsFor(rooftops: Rooftop[]): Totals {
  const greenM2 = rooftops.reduce((s, r) => s + r.area, 0)
  const coolingC = rooftops.reduce((s, r) => s + r.coolingC, 0)
  const costEur = rooftops.reduce((s, r) => s + r.costEur, 0)
  return {
    count: rooftops.length,
    greenM2,
    coolingC,
    costEur,
    eurPerC: coolingC > 0 ? costEur / coolingC : 0,
  }
}
