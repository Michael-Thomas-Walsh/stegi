// The left sidebar: live totals, searchable rooftop list and selected-roof
// detail. It reads shared state only; map/list click wiring remains in main.ts.

import type { Rooftop } from './state'
import { state } from './state'
import { totalsFor } from './cooling'
import {
  heightColour,
  heightConfidenceLabel,
  heightSourceLabel,
  summariseHeights,
} from './height'

const hint = document.querySelector<HTMLElement>('#hint')!
const tally = document.querySelector<HTMLElement>('#tally')!
const list = document.querySelector<HTMLUListElement>('#rooftop-list')!
const detail = document.querySelector<HTMLElement>('#detail')!

let onRowClick: ((id: number) => void) | null = null

export function onRooftopRowClick(callback: (id: number) => void): void {
  onRowClick = callback
}

const euro = (value: number): string =>
  `€${Math.round(value).toLocaleString('en-GB')}`

const num = (value: number, digits = 0): string =>
  value.toLocaleString('en-GB', { maximumFractionDigits: digits })

const heightText = (heightM: number | null): string =>
  heightM === null ? 'No height data' : `${num(heightM, 1)} m`

function searchableText(rooftop: Rooftop): string {
  return [
    rooftop.greenType,
    rooftop.heightSource,
    heightSourceLabel(rooftop.heightSource),
    rooftop.heightConfidence,
    rooftop.osmTags.name ?? '',
    rooftop.osmTags.building ?? '',
    rooftop.buildingLevels?.toString() ?? '',
    rooftop.heightM?.toFixed(1) ?? '',
  ]
    .join(' ')
    .toLowerCase()
}

function visibleRooftops(): Rooftop[] {
  const query = state.filter.trim().toLowerCase()
  if (!query) return state.rooftops
  return state.rooftops.filter((rooftop) =>
    searchableText(rooftop).includes(query),
  )
}

function rankedRooftops(rooftops: Rooftop[]): Rooftop[] {
  if (state.mapDisplay === 'height') {
    return [...rooftops].sort(
      (a, b) => (b.heightM ?? Number.NEGATIVE_INFINITY) - (a.heightM ?? Number.NEGATIVE_INFINITY),
    )
  }

  if (state.mapDisplay === 'height-confidence') {
    const rank = { high: 0, medium: 1, none: 2 } as const
    return [...rooftops].sort(
      (a, b) => rank[a.heightConfidence] - rank[b.heightConfidence],
    )
  }

  return [...rooftops].sort((a, b) => {
    const aValue = a.coolingC > 0 ? a.costEur / a.coolingC : Number.POSITIVE_INFINITY
    const bValue = b.coolingC > 0 ? b.costEur / b.coolingC : Number.POSITIVE_INFINITY
    return aValue - bValue
  })
}

function rowPrimary(rooftop: Rooftop): string {
  if (state.mapDisplay === 'height') return heightText(rooftop.heightM)
  if (state.mapDisplay === 'height-confidence') {
    return heightSourceLabel(rooftop.heightSource)
  }
  return rooftop.greenType
}

function rowSecondary(rooftop: Rooftop): string {
  if (state.mapDisplay === 'height') {
    return `${num(rooftop.area)} m² · ${heightSourceLabel(rooftop.heightSource)}`
  }

  if (state.mapDisplay === 'height-confidence') {
    return `${heightConfidenceLabel(rooftop.heightConfidence)} confidence · ${heightText(rooftop.heightM)}`
  }

  return `${num(rooftop.area)} m² · ${num(rooftop.coolingC, 2)}°C · ${euro(rooftop.costEur)}`
}

function rowColour(rooftop: Rooftop): string {
  if (state.mapDisplay === 'height') return heightColour(rooftop.heightM)
  if (state.mapDisplay === 'height-confidence') {
    if (rooftop.heightConfidence === 'high') return '#2f6f45'
    if (rooftop.heightConfidence === 'medium') return '#d18a32'
    return '#a6a8a6'
  }
  return rooftop.greenType === 'PARK' ? '#1b5e20' : '#8bc34a'
}

export function renderSidebar(): void {
  const shown = visibleRooftops()

  if (state.rooftops.length === 0) {
    tally.hidden = true
    list.innerHTML = ''
    detail.hidden = true
    return
  }

  hint.hidden = true

  const totals = totalsFor(shown)
  const heights = summariseHeights(shown)
  tally.hidden = false
  tally.innerHTML = `
    <div class="tally-grid">
      <div><b>${num(totals.greenM2)}</b><span>green m²</span></div>
      <div><b>${num(totals.coolingC, 2)} °C</b><span>cooling</span></div>
      <div><b>${euro(totals.costEur)}</b><span>cost</span></div>
      <div><b>${euro(totals.eurPerC)}</b><span>per °C</span></div>
    </div>
    <div class="height-summary">
      <div>
        <strong>${num(heights.coveragePercent)}%</strong>
        <span>height coverage</span>
      </div>
      <div>
        <strong>${heights.averageKnownM === null ? '—' : `${num(heights.averageKnownM, 1)} m`}</strong>
        <span>average known height</span>
      </div>
      <p>${heights.explicit} explicit · ${heights.estimated} estimated · ${heights.missing} unavailable</p>
    </div>
    <p class="disclaimer">Cooling and cost are illustrative estimates. Height is relative to local ground, not elevation above sea level.</p>
  `

  list.innerHTML = ''
  for (const rooftop of rankedRooftops(shown)) {
    const item = document.createElement('li')
    item.className = `roof-row${rooftop.id === state.selectedId ? ' selected' : ''}`

    const dot = document.createElement('span')
    dot.className = 'dot'
    dot.style.backgroundColor = rowColour(rooftop)

    const label = document.createElement('span')
    label.className = 'roof-label'
    label.textContent = rowPrimary(rooftop)

    const figures = document.createElement('span')
    figures.className = 'roof-figs'
    figures.textContent = rowSecondary(rooftop)

    item.append(dot, label, figures)
    item.addEventListener('click', () => onRowClick?.(rooftop.id))
    list.appendChild(item)
  }

  renderDetail()
}

function detailValue(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function renderDetail(): void {
  const rooftop = state.rooftops.find((candidate) => candidate.id === state.selectedId)
  if (!rooftop) {
    detail.hidden = true
    return
  }

  const osmReference = rooftop.osmId === null ? 'Unavailable' : `Way ${rooftop.osmId}`
  const levels = rooftop.buildingLevels === null
    ? 'Not tagged'
    : num(rooftop.buildingLevels, 1)

  detail.hidden = false
  detail.innerHTML = `
    <h2>${detailValue(rooftop.greenType)} rooftop</h2>
    <dl>
      <dt>Area</dt><dd>${num(rooftop.area)} m²</dd>
      <dt>Orientation</dt><dd>${num(rooftop.orientation)}°</dd>
      <dt>Neighbours (60 m)</dt><dd>${rooftop.density}</dd>
      <dt>To nearest green</dt><dd>${num(rooftop.distanceToGreen)} m</dd>
      <dt>Relative roof Z</dt><dd>${heightText(rooftop.heightM)}</dd>
      <dt>Building levels</dt><dd>${levels}</dd>
      <dt>Height source</dt><dd>${detailValue(heightSourceLabel(rooftop.heightSource))}</dd>
      <dt>Height confidence</dt><dd>${heightConfidenceLabel(rooftop.heightConfidence)}</dd>
      <dt>OSM reference</dt><dd>${osmReference}</dd>
      <dt>Cooling</dt><dd>${num(rooftop.coolingC, 2)} °C</dd>
      <dt>Cost</dt><dd>${euro(rooftop.costEur)}</dd>
      <dt>Cost per °C</dt><dd>${rooftop.coolingC > 0 ? euro(rooftop.costEur / rooftop.coolingC) : '—'}</dd>
    </dl>
    <p class="detail-note">Relative roof Z is the building top above local ground. It is not an absolute terrain or sea-level elevation.</p>
  `

  detail.scrollIntoView({ block: 'nearest' })
}
