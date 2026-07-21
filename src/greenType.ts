// The rule layer: turns each cluster + its context into a green FORM.
//
// PARK   — accessible public green, intensive planting. We put it on the
//          cluster of large roofs, in dense areas, far from existing parks.
//          Higher cooling, higher cost.
// GARDEN — communal / productive green, lighter planting. Everything else.
//          Lower cost, easy to spread widely.

import type { Rooftop } from './state'

// Average a field across the roofs in one cluster.
function meanOf(rooftops: Rooftop[], pick: (r: Rooftop) => number): number {
  if (rooftops.length === 0) return 0
  return rooftops.reduce((s, r) => s + pick(r), 0) / rooftops.length
}

// Assigns each rooftop a `greenType`. Mutates in place.
export function assignGreenTypes(rooftops: Rooftop[]): void {
  if (rooftops.length === 0) return

  const clusters = [...new Set(rooftops.map((r) => r.cluster))]

  // Score each cluster on "how park-like is it?" = big + dense + far from
  // existing green. We rank clusters and crown the single best one PARK.
  const maxArea = Math.max(...rooftops.map((r) => r.area))
  const maxDensity = Math.max(...rooftops.map((r) => r.density), 1)
  const maxDist = Math.max(...rooftops.map((r) => r.distanceToGreen), 1)

  let parkCluster = clusters[0]
  let bestScore = -Infinity
  for (const cl of clusters) {
    const roofs = rooftops.filter((r) => r.cluster === cl)
    const score =
      meanOf(roofs, (r) => r.area) / maxArea +
      meanOf(roofs, (r) => r.density) / maxDensity +
      meanOf(roofs, (r) => r.distanceToGreen) / maxDist
    if (score > bestScore) {
      bestScore = score
      parkCluster = cl
    }
  }

  for (const r of rooftops) {
    r.greenType = r.cluster === parkCluster ? 'PARK' : 'GARDEN'
  }
}
