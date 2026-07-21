// The left sidebar: the live tally, the searchable rooftop list, and the
// detail panel for the selected rooftop. It only reads state and renders —
// clicks are handled back in main.ts so the map stays in sync.

import type { Rooftop } from './state'
import { state } from './state'
import { totalsFor } from './cooling'

const hint = document.querySelector<HTMLParagraphElement>('#hint')!
const tally = document.querySelector<HTMLDivElement>('#tally')!
const list = document.querySelector<HTMLUListElement>('#rooftop-list')!
const detail = document.querySelector<HTMLDivElement>('#detail')!

let onRowClick: ((id: number) => void) | null = null
export function onRooftopRowClick(cb: (id: number) => void) {
  onRowClick = cb
}

const euro = (n: number) =>
  '€' + Math.round(n).toLocaleString('en-US')
const num = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { maximumFractionDigits: digits })

// The roofs currently shown, after the search filter is applied.
function visibleRooftops(): Rooftop[] {
  const q = state.filter.trim().toLowerCase()
  if (!q) return state.rooftops
  return state.rooftops.filter((r) => r.greenType.toLowerCase().includes(q))
}

export function renderSidebar() {
  const shown = visibleRooftops()

  if (state.rooftops.length === 0) {
    tally.hidden = true
    list.innerHTML = ''
    detail.hidden = true
    return
  }

  hint.hidden = true

  // --- live tally over the visible roofs ---
  const t = totalsFor(shown)
  tally.hidden = false
  tally.innerHTML = `
    <div class="tally-grid">
      <div><b>${num(t.greenM2)}</b><span>green m²</span></div>
      <div><b>${num(t.coolingC, 2)} °C</b><span>cooling</span></div>
      <div><b>${euro(t.costEur)}</b><span>cost</span></div>
      <div><b>${euro(t.eurPerC)}</b><span>per °C</span></div>
    </div>
    <p class="disclaimer">Illustrative estimates, not certified figures.</p>`

  // --- the rooftop list (ranked by cost-effectiveness, best first) ---
  const ranked = [...shown].sort(
    (a, b) => a.costEur / a.coolingC - b.costEur / b.coolingC,
  )
  list.innerHTML = ''
  for (const r of ranked) {
    const li = document.createElement('li')
    li.className =
      'roof-row' + (r.id === state.selectedId ? ' selected' : '')
    li.innerHTML = `
      <span class="dot ${r.greenType.toLowerCase()}"></span>
      <span class="roof-label">${r.greenType} · ${num(r.area)} m²</span>
      <span class="roof-figs">${num(r.coolingC, 2)}°C · ${euro(r.costEur)}</span>`
    li.addEventListener('click', () => onRowClick?.(r.id))
    list.appendChild(li)
  }

  renderDetail()
}

function renderDetail() {
  const r = state.rooftops.find((x) => x.id === state.selectedId)
  if (!r) {
    detail.hidden = true
    return
  }
  detail.hidden = false
  detail.innerHTML = `
    <h2>${r.greenType}</h2>
    <dl>
      <dt>Area</dt><dd>${num(r.area)} m²</dd>
      <dt>Orientation</dt><dd>${num(r.orientation)}°</dd>
      <dt>Neighbours (60 m)</dt><dd>${r.density}</dd>
      <dt>To nearest green</dt><dd>${num(r.distanceToGreen)} m</dd>
      <dt>Cooling</dt><dd>${num(r.coolingC, 2)} °C</dd>
      <dt>Cost</dt><dd>${euro(r.costEur)}</dd>
      <dt>Cost per °C</dt><dd>${euro(r.costEur / r.coolingC)}</dd>
    </dl>`
  // Bring the panel into view so a click on the map or a far-down list row
  // doesn't leave the details off-screen.
  detail.scrollIntoView({ block: 'nearest' })
}
