// The ML core: k-means clustering, hand-written in plain TypeScript.
//
// It groups rooftops into "typologies" — roofs with similar area, shape,
// density, etc. end up in the same cluster. No library needed; k-means is
// just: pick k centres, assign each point to its nearest centre, move each
// centre to the average of its points, repeat.

import type { Rooftop } from './state'

const ITERATIONS = 20

// The features we cluster on. (orientation is left out on purpose — a roof
// facing 10° vs 170° shouldn't split typologies the way size/density do.)
function vectorOf(r: Rooftop): number[] {
  return [r.area, r.aspectRatio, r.density, r.distanceToGreen]
}

// Rescale every column to 0..1 so that big numbers (area) don't drown out
// small ones (aspect ratio) when we measure distance.
function normalise(rows: number[][]): number[][] {
  const cols = rows[0].length
  const min = new Array(cols).fill(Infinity)
  const max = new Array(cols).fill(-Infinity)
  for (const row of rows) {
    row.forEach((v, c) => {
      min[c] = Math.min(min[c], v)
      max[c] = Math.max(max[c], v)
    })
  }
  return rows.map((row) =>
    row.map((v, c) => {
      const span = max[c] - min[c]
      return span === 0 ? 0 : (v - min[c]) / span
    }),
  )
}

function distance(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2
  return sum // squared distance is enough for "which is nearest"
}

// Assigns each rooftop a `cluster` number (0..k-1). Mutates in place.
export function clusterRooftops(rooftops: Rooftop[], k = 3): void {
  if (rooftops.length === 0) return
  const usedK = Math.min(k, rooftops.length)

  const points = normalise(rooftops.map(vectorOf))

  // Deterministic start: sort by overall size and pick k evenly-spaced
  // points as the first centres. (Same input → same clusters every run.)
  const order = points
    .map((p, i) => ({ i, size: p.reduce((s, v) => s + v, 0) }))
    .sort((a, b) => a.size - b.size)
  let centres: number[][] = []
  for (let c = 0; c < usedK; c++) {
    const idx = Math.floor((c / usedK) * order.length)
    centres.push([...points[order[idx].i]])
  }

  const assignment = new Array(points.length).fill(0)

  for (let step = 0; step < ITERATIONS; step++) {
    // Assign each point to its nearest centre.
    for (let p = 0; p < points.length; p++) {
      let best = 0
      let bestDist = Infinity
      for (let c = 0; c < usedK; c++) {
        const d = distance(points[p], centres[c])
        if (d < bestDist) {
          bestDist = d
          best = c
        }
      }
      assignment[p] = best
    }

    // Move each centre to the average of its assigned points.
    const sums = centres.map((c) => new Array(c.length).fill(0))
    const counts = new Array(usedK).fill(0)
    for (let p = 0; p < points.length; p++) {
      const c = assignment[p]
      counts[c]++
      points[p].forEach((v, d) => (sums[c][d] += v))
    }
    centres = sums.map((sum, c) =>
      counts[c] === 0 ? centres[c] : sum.map((v) => v / counts[c]),
    )
  }

  rooftops.forEach((r, i) => (r.cluster = assignment[i]))
}
