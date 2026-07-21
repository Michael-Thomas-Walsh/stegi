// Entry point: wires the map, the sidebar, and the detection pipeline
// together. Data flows one way (see docs/architecture.md):
// boundary → OSM → features → clusters → green type → cooling/cost → screen.

import { state } from './state'
import {
  createMap,
  onBoundaryFinished,
  onDrawModeChanged,
  startDrawMode,
  onRooftopClick,
  clearMap,
  drawRooftops,
  restyleRooftops,
} from './map'
import { fetchShapes } from './osm'
import { buildRooftops } from './features'
import { clusterRooftops } from './cluster'
import { assignGreenTypes } from './greenType'
import { computeCoolingAndCost } from './cooling'
import { renderSidebar, onRooftopRowClick } from './sidebar'

createMap('map')

// --- grab the buttons/inputs from the page ---
const drawBtn = document.querySelector<HTMLButtonElement>('#draw')!
const detectBtn = document.querySelector<HTMLButtonElement>('#detect')!
const toggleBtn = document.querySelector<HTMLButtonElement>('#toggle-view')!
const clearBtn = document.querySelector<HTMLButtonElement>('#clear')!
const search = document.querySelector<HTMLInputElement>('#search')!
const hint = document.querySelector<HTMLParagraphElement>('#hint')!

// Selecting a roof updates BOTH the map outline and the sidebar row/detail.
function selectRoof(id: number) {
  state.selectedId = state.selectedId === id ? null : id
  restyleRooftops(state.rooftops)
  renderSidebar()
}
onRooftopClick(selectRoof)
onRooftopRowClick(selectRoof)

// Wipe everything back to a blank slate (used by Clear and by Draw area).
function resetAll() {
  clearMap()
  state.boundary = []
  state.rooftops = []
  state.selectedId = null
  state.filter = ''
  search.value = ''
  search.disabled = true
  toggleBtn.disabled = true
  detectBtn.disabled = true
  clearBtn.disabled = true
  renderSidebar()
}

// "Draw area": clear anything there and start a fresh box.
drawBtn.addEventListener('click', () => {
  resetAll()
  startDrawMode()
})

// The map tells us when drawing starts/stops so the hint + button reflect it.
onDrawModeChanged((active) => {
  drawBtn.classList.toggle('active', active)
  if (active) {
    hint.hidden = false
    hint.textContent = 'Drag a box across the map to pick your neighbourhood.'
  }
})

// Once the box is drawn, the user can run detection.
onBoundaryFinished(() => {
  detectBtn.disabled = false
  clearBtn.disabled = false
  hint.textContent = 'Area set — click "Detect rooftops".'
})

// The whole pipeline, run when the user clicks Detect.
detectBtn.addEventListener('click', async () => {
  detectBtn.disabled = true
  hint.hidden = false
  hint.textContent = 'Fetching rooftops from OpenStreetMap…'
  try {
    const shapes = await fetchShapes(state.boundary)
    const rooftops = buildRooftops(shapes)
    if (rooftops.length === 0) {
      hint.textContent = 'No usable rooftops found here — try a bigger area.'
      detectBtn.disabled = false
      return
    }
    clusterRooftops(rooftops)
    assignGreenTypes(rooftops)
    computeCoolingAndCost(rooftops)

    state.rooftops = rooftops
    drawRooftops(rooftops)
    renderSidebar()

    search.disabled = false
    toggleBtn.disabled = false
  } catch (err) {
    hint.textContent =
      'Could not reach OpenStreetMap. Check your connection and try again.'
    detectBtn.disabled = false
    console.error(err)
  }
})

// Before/After toggle: flip every roof between grey and its green colour.
toggleBtn.addEventListener('click', () => {
  state.showAfter = !state.showAfter
  toggleBtn.textContent = state.showAfter ? 'Show: After' : 'Show: Before'
  restyleRooftops(state.rooftops)
})

// Search filters both the list and (by dimming) the map.
search.addEventListener('input', () => {
  state.filter = search.value
  restyleRooftops(state.rooftops)
  renderSidebar()
})

// Clear: wipe everything and drop straight back into draw mode.
clearBtn.addEventListener('click', () => {
  resetAll()
  startDrawMode()
})

// Start the app already in draw mode, so it's obvious what to do first.
startDrawMode()
