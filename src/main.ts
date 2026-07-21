// Entry point: wires the map, location inputs, project log, sidebar and the
// detection pipeline together.

import { state } from './state'
import {
  clearMap,
  createMap,
  drawRooftops,
  goToLocation,
  onBoundaryFinished,
  onBoundaryRejected,
  onDrawModeChanged,
  onRooftopClick,
  restyleRooftops,
  setBoundaryFromCoordinates,
  startDrawMode,
} from './map'
import { fetchShapes } from './osm'
import { buildRooftops } from './features'
import { clusterRooftops } from './cluster'
import { assignGreenTypes } from './greenType'
import { computeCoolingAndCost } from './cooling'
import { onRooftopRowClick, renderSidebar } from './sidebar'
import { geocodeAthensAddress } from './geocode'
import { readBoundaryFile } from './boundaryIO'
import { initialiseLog, writeLog } from './log'

createMap('map')
initialiseLog('activity-log')

const drawBtn = document.querySelector<HTMLButtonElement>('#draw')!
const detectBtn = document.querySelector<HTMLButtonElement>('#detect')!
const toggleBtn = document.querySelector<HTMLButtonElement>('#toggle-view')!
const clearBtn = document.querySelector<HTMLButtonElement>('#clear')!
const search = document.querySelector<HTMLInputElement>('#search')!
const hint = document.querySelector<HTMLParagraphElement>('#hint')!

const addressForm = document.querySelector<HTMLFormElement>('#address-form')!
const addressInput =
  document.querySelector<HTMLInputElement>('#address-search')!
const addressGoBtn = document.querySelector<HTMLButtonElement>('#address-go')!
const uploadBtn =
  document.querySelector<HTMLButtonElement>('#upload-boundary')!
const boundaryFileInput =
  document.querySelector<HTMLInputElement>('#boundary-file')!

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

function selectRoof(id: number): void {
  state.selectedId = state.selectedId === id ? null : id
  restyleRooftops(state.rooftops)
  renderSidebar()
}

onRooftopClick(selectRoof)
onRooftopRowClick(selectRoof)

function resetAll(): void {
  clearMap()
  state.boundary = []
  state.rooftops = []
  state.selectedId = null
  state.filter = ''
  state.showAfter = true

  search.value = ''
  search.disabled = true
  toggleBtn.textContent = 'Show: After'
  toggleBtn.disabled = true
  detectBtn.disabled = true
  clearBtn.disabled = true
  renderSidebar()
}

addressForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const query = addressInput.value.trim()
  if (!query) {
    hint.textContent = 'Enter an Athens address first.'
    writeLog('Address search skipped: no address was entered.', 'warning')
    return
  }

  addressGoBtn.disabled = true
  hint.textContent = 'Searching within Athens…'
  writeLog(`Searching for “${query}” within Athens…`)

  try {
    const result = await geocodeAthensAddress(query)
    goToLocation(result.lat, result.lng, result.displayName)
    hint.textContent = 'Address found. Draw or upload a study boundary.'
    writeLog(`Address found: ${result.displayName}`, 'success')
  } catch (error) {
    const message = errorMessage(error)
    hint.textContent = message
    writeLog(message, 'error')
  } finally {
    addressGoBtn.disabled = false
  }
})

uploadBtn.addEventListener('click', () => boundaryFileInput.click())

boundaryFileInput.addEventListener('change', async () => {
  const file = boundaryFileInput.files?.[0]
  if (!file) return

  uploadBtn.disabled = true
  hint.textContent = `Reading ${file.name}…`
  writeLog(`Reading boundary file: ${file.name}`)

  try {
    const result = await readBoundaryFile(file)
    resetAll()
    setBoundaryFromCoordinates(result.boundary)
    hint.textContent = 'Boundary loaded — click “Detect rooftops”.'
    writeLog(
      `Boundary loaded with ${result.boundary.length} vertices.`,
      'success',
    )
    if (result.notice) writeLog(result.notice, 'warning')
  } catch (error) {
    const message = errorMessage(error)
    hint.textContent = message
    writeLog(`Boundary upload failed: ${message}`, 'error')
    startDrawMode()
  } finally {
    uploadBtn.disabled = false
    boundaryFileInput.value = ''
  }
})

drawBtn.addEventListener('click', () => {
  resetAll()
  startDrawMode()
  writeLog('Draw mode started. Drag a rectangle inside Athens.')
})

onDrawModeChanged((active) => {
  drawBtn.classList.toggle('active', active)
  if (active) {
    hint.hidden = false
    hint.textContent = 'Drag a box across the map to pick your neighbourhood.'
  }
})

onBoundaryRejected((message) => {
  hint.textContent = message
  writeLog(`Boundary rejected: ${message}`, 'error')
})

onBoundaryFinished(() => {
  detectBtn.disabled = false
  clearBtn.disabled = false
  hint.textContent = 'Area set — click “Detect rooftops”.'
  writeLog('Study boundary accepted inside the Athens study area.', 'success')
})

detectBtn.addEventListener('click', async () => {
  detectBtn.disabled = true
  hint.hidden = false
  hint.textContent = 'Fetching rooftops from OpenStreetMap…'
  writeLog('Requesting buildings and green spaces from OpenStreetMap…')

  try {
    const shapes = await fetchShapes(state.boundary)
    const rooftops = buildRooftops(shapes)

    if (rooftops.length === 0) {
      hint.textContent = 'No usable rooftops found here — try a bigger area.'
      writeLog('No usable rooftops were found in this boundary.', 'warning')
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
    hint.textContent = `${rooftops.length} rooftops analysed.`
    writeLog(`${rooftops.length} rooftops analysed successfully.`, 'success')
  } catch (error) {
    hint.textContent =
      'Could not reach OpenStreetMap. Check your connection and try again.'
    detectBtn.disabled = false
    writeLog(`OpenStreetMap request failed: ${errorMessage(error)}`, 'error')
    console.error(error)
  }
})

toggleBtn.addEventListener('click', () => {
  state.showAfter = !state.showAfter
  toggleBtn.textContent = state.showAfter ? 'Show: After' : 'Show: Before'
  restyleRooftops(state.rooftops)
})

search.addEventListener('input', () => {
  state.filter = search.value
  restyleRooftops(state.rooftops)
  renderSidebar()
})

clearBtn.addEventListener('click', () => {
  resetAll()
  startDrawMode()
  writeLog('Map and study boundary cleared.')
})

writeLog('STÉGI ready. Searches and boundaries are restricted to Athens.', 'success')
startDrawMode()
