// K-means rooftop clustering. Building height is included where OSM provides
// it; roofs without height data receive the study area's median known height
// so missing data does not automatically create its own typology.

import type { Rooftop } from './state'
import { summariseHeights } from './height'

const ITERATIONS = 20

function vectorOf(rooftop: Rooftop, fallbackHeightM: number): number[] {
  return [
    rooftop.area,
    rooftop.aspectRatio,
    rooftop.density,
    rooftop.distanceToGreen,
    rooftop.heightM ?? fallbackHeightM,
  ]
}

function normalise(rows: number[][]): number[][] {
  const columns = rows[0].length
  const minimum = new Array(columns).fill(Number.POSITIVE_INFINITY)
  const maximum = new Array(columns).fill(Number.NEGATIVE_INFINITY)

  for (const row of rows) {
    row.forEach((value, column) => {
      minimum[column] = Math.min(minimum[column], value)
      maximum[column] = Math.max(maximum[column], value)
    })
  }

  return rows.map((row) =>
    row.map((value, column) => {
      const span = maximum[column] - minimum[column]
      return span === 0 ? 0 : (value - minimum[column]) / span
    }),
  )
}

function distance(a: number[], b: number[]): number {
  let sum = 0
  for (let index = 0; index < a.length; index += 1) {
    sum += (a[index] - b[index]) ** 2
  }
  return sum
}

export function clusterRooftops(rooftops: Rooftop[], k = 3): void {
  if (rooftops.length === 0) return

  const usedK = Math.min(k, rooftops.length)
  const heightSummary = summariseHeights(rooftops)
  const fallbackHeightM = heightSummary.medianKnownM ?? 12
  const points = normalise(
    rooftops.map((rooftop) => vectorOf(rooftop, fallbackHeightM)),
  )

  const order = points
    .map((point, index) => ({
      index,
      size: point.reduce((sum, value) => sum + value, 0),
    }))
    .sort((a, b) => a.size - b.size)

  let centres: number[][] = []
  for (let centreIndex = 0; centreIndex < usedK; centreIndex += 1) {
    const orderIndex = Math.floor((centreIndex / usedK) * order.length)
    centres.push([...points[order[orderIndex].index]])
  }

  const assignment = new Array(points.length).fill(0)

  for (let step = 0; step < ITERATIONS; step += 1) {
    for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
      let bestCentre = 0
      let bestDistance = Number.POSITIVE_INFINITY

      for (let centreIndex = 0; centreIndex < usedK; centreIndex += 1) {
        const currentDistance = distance(points[pointIndex], centres[centreIndex])
        if (currentDistance < bestDistance) {
          bestDistance = currentDistance
          bestCentre = centreIndex
        }
      }

      assignment[pointIndex] = bestCentre
    }

    const sums = centres.map((centre) => new Array(centre.length).fill(0))
    const counts = new Array(usedK).fill(0)

    for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
      const centreIndex = assignment[pointIndex]
      counts[centreIndex] += 1
      points[pointIndex].forEach((value, dimension) => {
        sums[centreIndex][dimension] += value
      })
    }

    centres = sums.map((sum, centreIndex) =>
      counts[centreIndex] === 0
        ? centres[centreIndex]
        : sum.map((value) => value / counts[centreIndex]),
    )
  }

  rooftops.forEach((rooftop, index) => {
    rooftop.cluster = assignment[index]
  })
}
