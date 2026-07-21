// Entry point: wires the staged site → boundary → footprint workflow together.

import { state, type MapDisplayMode } from './state'
import {
  cancelDrawingMode,
  clearMap,
  clearStudyArea,
  confirmPendingBoundary,
  createMap,
  drawRooftops,
  finishPolygonMode,
  goToLocation,
  onBoundaryConfirmed,
  onBoundaryReady,
  onBoundaryRejected,
  onDrawModeChanged,
  onRooftopClick,
  restyleRooftops,
  setPendingBoundaryFromCoordinates,
  startPolygonMode,
  startRectangleMode,
  type BoundarySource,
  type DrawMode,
} from './map'
import { fetchShapes, type OsmProgressEvent } from './osm'
import { buildRooftops } from './features'
import { summariseHeights } from './height'
import { clusterRooftops } from './cluster'
import { assignGreenTypes } from './greenType'
import { computeCoolingAndCost } from './cooling'
import { onRooftopRowClick, renderSidebar } from './sidebar'
import { geocodeAthensAddress } from './geocode'
import { readBoundaryFile } from './boundaryIO'
import { initialiseLog, writeLog } from './log'
import {
  completeLoading,
  failLoading,
  initialiseLoading,
  nextPaint,
  showLoading,
  updateLoading,
} from './loading'

createMap('map')
initialiseLog('activity-log')
initialiseLoading()

const addressForm = document.querySelector<HTMLFormElement>('#address-form')!
const addressInput = document.querySelector<HTMLInputElement>('#address-search')!
const addressGoBtn = document.querySelector<HTMLButtonElement>('#address-go')!

const methodSelect =
  document.querySelector<HTMLSelectElement>('#boundary-method')!
const drawingControls =
  document.querySelector<HTMLDivElement>('#drawing-controls')!
const uploadControls =
  document.querySelector<HTMLDivElement>('#upload-controls')!
const boundaryActionBtn =
  document.querySelector<HTMLButtonElement>('#boundary-action')!
const finishPolygonBtn =
  document.querySelector<HTMLButtonElement>('#finish-polygon')!
const cancelDrawingBtn =
  document.querySelector<HTMLButtonElement>('#cancel-drawing')!
const boundaryFileInput =
  document.querySelector<HTMLInputElement>('#boundary-file')!
const loadBoundaryBtn =
  document.querySelector<HTMLButtonElement>('#load-boundary')!
const confirmBoundaryBtn =
  document.querySelector<HTMLButtonElement>('#confirm-boundary')!
const clearBtn = document.querySelector<HTMLButtonElement>('#clear')!
const boundaryHelp =
  document.querySelector<HTMLParagraphElement>('#boundary-help')!
const boundaryStatus =
  document.querySelector<HTMLElement>('#boundary-status')!

const detectBtn = document.querySelector<HTMLButtonElement>('#detect')!
const toggleBtn =
  document.querySelector<HTMLButtonElement>('#toggle-view')!
const search = document.querySelector<HTMLInputElement>('#search')!
const mapDisplaySelect =
  document.querySelector<HTMLSelectElement>('#map-display')!
const heightLegend =
  document.querySelector<HTMLElement>('#height-legend')!
const heightConfidenceLegend =
  document.querySelector<HTMLElement>('#height-confidence-legend')!
const hint = document.querySelector<HTMLParagraphElement>('#hint')!

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

function sourceLabel(source: BoundarySource): string {
  if (source === 'rectangle') return 'Rectangle'
  if (source === 'polygon') return 'Polygon'
  return 'Shapefile'
}

function selectRoof(id: number): void {
  state.selectedId = state.selectedId === id ? null : id
  restyleRooftops(state.rooftops)
  renderSidebar()
}

onRooftopClick(selectRoof)
onRooftopRowClick(selectRoof)

function resetAnalysis(): void {
  state.rooftops = []
  state.selectedId = null
  state.filter = ''
  state.showAfter = true
  state.mapDisplay = 'proposal'
  search.value = ''
  search.disabled = true
  search.placeholder = 'Filter: park / garden / height'
  mapDisplaySelect.value = 'proposal'
  mapDisplaySelect.disabled = true
  heightLegend.hidden = true
  heightConfidenceLegend.hidden = true
  toggleBtn.textContent = 'Show: After'
  toggleBtn.disabled = true
  renderSidebar()
}

function updateMapDisplayUI(): void {
  const hasResults = state.rooftops.length > 0
  const proposalMode = state.mapDisplay === 'proposal'

  toggleBtn.disabled = !hasResults || !proposalMode
  heightLegend.hidden = state.mapDisplay !== 'height'
  heightConfidenceLegend.hidden = state.mapDisplay !== 'height-confidence'

  if (state.mapDisplay === 'height') {
    search.placeholder = 'Filter: height / levels / source'
  } else if (state.mapDisplay === 'height-confidence') {
    search.placeholder = 'Filter: explicit / estimated / unavailable'
  } else {
    search.placeholder = 'Filter: park / garden / height'
  }

  restyleRooftops(state.rooftops)
  renderSidebar()
}

function setBoundaryStatus(
  text: string,
  kind: 'neutral' | 'pending' | 'confirmed' | 'error' = 'neutral',
): void {
  boundaryStatus.textContent = text
  boundaryStatus.className = `status-pill ${kind}`
}

function beginNewBoundary(): void {
  clearStudyArea()
  resetAnalysis()
  confirmBoundaryBtn.disabled = true
  detectBtn.disabled = true
  clearBtn.disabled = false
  setBoundaryStatus('In progress', 'pending')
}

function resetBoundaryWorkflow(): void {
  clearStudyArea()
  resetAnalysis()
  confirmBoundaryBtn.disabled = true
  detectBtn.disabled = true
  clearBtn.disabled = true
  boundaryFileInput.value = ''
  loadBoundaryBtn.disabled = true
  setBoundaryStatus('Not set')
  hint.textContent = 'Set a study boundary using the controls above.'
}

function updateBoundaryMethodUI(): void {
  const method = methodSelect.value
  const isUpload = method === 'shapefile'

  cancelDrawingMode()
  drawingControls.hidden = isUpload
  uploadControls.hidden = !isUpload
  finishPolygonBtn.hidden = true
  cancelDrawingBtn.hidden = true
  boundaryActionBtn.disabled = false

  if (method === 'rectangle') {
    boundaryActionBtn.textContent = 'Draw rectangle'
    boundaryHelp.textContent =
      'Click “Draw rectangle”, then drag across the map. The boundary must remain inside Athens.'
  } else if (method === 'polygon') {
    boundaryActionBtn.textContent = 'Start polygon'
    boundaryHelp.textContent =
      'Click points around the site, then use “Finish polygon”. Add at least three vertices.'
  } else {
    boundaryHelp.textContent =
      'Upload one ZIP containing SHP, SHX and DBF files. Include the PRJ file so coordinates can be transformed correctly.'
  }
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
    hint.textContent = 'Address found. Set the study boundary below.'
    writeLog(`Address found: ${result.displayName}`, 'success')
  } catch (error) {
    const message = errorMessage(error)
    hint.textContent = message
    writeLog(message, 'error')
  } finally {
    addressGoBtn.disabled = false
  }
})

methodSelect.addEventListener('change', updateBoundaryMethodUI)

boundaryActionBtn.addEventListener('click', () => {
  const method = methodSelect.value
  beginNewBoundary()

  if (method === 'rectangle') {
    startRectangleMode()
    hint.textContent = 'Drag across the map to create the rectangle.'
    writeLog('Rectangle drawing started.')
  } else if (method === 'polygon') {
    startPolygonMode()
    hint.textContent = 'Click around the site, then choose “Finish polygon”.'
    writeLog('Polygon drawing started. Add at least three vertices.')
  }
})

finishPolygonBtn.addEventListener('click', () => {
  finishPolygonMode()
})

cancelDrawingBtn.addEventListener('click', () => {
  cancelDrawingMode()
  resetBoundaryWorkflow()
  writeLog('Boundary drawing cancelled.')
})

boundaryFileInput.addEventListener('change', () => {
  const file = boundaryFileInput.files?.[0]
  loadBoundaryBtn.disabled = !file
  if (file) {
    setBoundaryStatus('File selected', 'pending')
    clearBtn.disabled = false
  }
})

loadBoundaryBtn.addEventListener('click', async () => {
  const file = boundaryFileInput.files?.[0]
  if (!file) return

  beginNewBoundary()
  loadBoundaryBtn.disabled = true
  hint.textContent = 'Reading the shapefile…'
  writeLog(`Reading boundary file “${file.name}”…`)

  try {
    const result = await readBoundaryFile(file)
    setPendingBoundaryFromCoordinates(result.boundary, 'shapefile')
    if (result.notice) writeLog(result.notice, 'warning')
  } catch (error) {
    const message = errorMessage(error)
    setBoundaryStatus('Could not load', 'error')
    hint.textContent = message
    writeLog(`Shapefile rejected: ${message}`, 'error')
  } finally {
    loadBoundaryBtn.disabled = false
  }
})

onDrawModeChanged((mode: DrawMode | null) => {
  const polygonActive = mode === 'polygon'
  const drawingActive = mode !== null

  boundaryActionBtn.disabled = drawingActive
  finishPolygonBtn.hidden = !polygonActive
  cancelDrawingBtn.hidden = !drawingActive
})

onBoundaryRejected((message) => {
  confirmBoundaryBtn.disabled = true
  detectBtn.disabled = true
  setBoundaryStatus('Needs attention', 'error')
  hint.textContent = message
  writeLog(`Boundary rejected: ${message}`, 'error')
})

onBoundaryReady((source, vertexCount) => {
  confirmBoundaryBtn.disabled = false
  detectBtn.disabled = true
  clearBtn.disabled = false
  setBoundaryStatus('Ready to confirm', 'pending')
  hint.textContent = 'Review the orange boundary, then confirm it.'
  writeLog(
    `${sourceLabel(source)} boundary prepared with ${vertexCount} vertices. Confirmation required.`,
    'success',
  )
})

confirmBoundaryBtn.addEventListener('click', () => {
  if (!confirmPendingBoundary()) {
    writeLog('No pending boundary is available to confirm.', 'warning')
  }
})

onBoundaryConfirmed(() => {
  confirmBoundaryBtn.disabled = true
  detectBtn.disabled = false
  clearBtn.disabled = false
  setBoundaryStatus('Confirmed', 'confirmed')
  hint.textContent = 'Boundary confirmed. You can now detect building footprints.'
  writeLog('Study boundary confirmed. Footprint detection is now available.', 'success')
})

function reportOsmProgress(event: OsmProgressEvent): void {
  const progressByStage: Record<OsmProgressEvent['stage'], number> = {
    query: 12,
    connecting: 25,
    retrying: 30,
    downloaded: 50,
    processing: 56,
    complete: 62,
  }

  const title =
    event.stage === 'retrying'
      ? 'Trying another map server'
      : event.stage === 'processing' || event.stage === 'complete'
        ? 'Preparing map geometry'
        : 'Downloading OpenStreetMap data'

  updateLoading(title, event.message, progressByStage[event.stage])
  writeLog(event.message, event.stage === 'retrying' ? 'warning' : 'info')
}

detectBtn.addEventListener('click', async () => {
  if (state.boundary.length < 3) {
    detectBtn.disabled = true
    hint.textContent = 'Confirm a study boundary before detecting footprints.'
    writeLog('Detection blocked because no boundary is confirmed.', 'warning')
    return
  }

  detectBtn.disabled = true
  hint.textContent = 'Analysing the confirmed study area…'
  showLoading(
    'Preparing the study area',
    'Checking the confirmed boundary before contacting OpenStreetMap…',
    5,
  )
  writeLog('Footprint analysis started for the confirmed boundary.')

  try {
    await nextPaint()
    const shapes = await fetchShapes(state.boundary, reportOsmProgress)

    updateLoading(
      'Building the rooftop dataset',
      'Measuring footprint geometry and proximity to existing green space…',
      68,
    )
    await nextPaint()
    const rooftops = buildRooftops(shapes)
    const heightSummary = summariseHeights(rooftops)
    writeLog(
      `Height coverage: ${Math.round(heightSummary.coveragePercent)}% (${heightSummary.explicit} explicit, ${heightSummary.estimated} estimated from levels, ${heightSummary.missing} unavailable).`,
      heightSummary.coveragePercent >= 50 ? 'success' : 'warning',
    )

    if (rooftops.length === 0) {
      hint.textContent = 'No usable rooftops found here — try a larger area.'
      writeLog('No usable rooftops were found in this boundary.', 'warning')
      await failLoading(
        'No usable rooftops found',
        'Try confirming a slightly larger study boundary.',
      )
      return
    }

    updateLoading(
      'Clustering rooftop types',
      `Grouping ${rooftops.length.toLocaleString()} rooftops by footprint, context and available height…`,
      76,
    )
    await nextPaint()
    clusterRooftops(rooftops)

    updateLoading(
      'Assigning greening strategies',
      'Comparing rooftop clusters and identifying park and garden opportunities…',
      84,
    )
    await nextPaint()
    assignGreenTypes(rooftops)

    updateLoading(
      'Estimating cooling and cost',
      'Calculating the illustrative before-and-after scenario…',
      91,
    )
    await nextPaint()
    computeCoolingAndCost(rooftops)
    state.rooftops = rooftops

    updateLoading(
      'Drawing the results',
      'Adding the analysed rooftop footprints and updating the sidebar…',
      97,
    )
    await nextPaint()
    drawRooftops(rooftops)
    search.disabled = false
    mapDisplaySelect.disabled = false
    updateMapDisplayUI()

    hint.textContent = `${rooftops.length} rooftops analysed. Height coverage: ${Math.round(heightSummary.coveragePercent)}%.`
    writeLog(`${rooftops.length} rooftops analysed successfully.`, 'success')
    await completeLoading(
      'Analysis complete',
      `${rooftops.length.toLocaleString()} rooftops are ready to explore.`,
    )
  } catch (error) {
    const message = errorMessage(error)
    hint.textContent =
      'Could not reach OpenStreetMap. Check your connection and try again.'
    writeLog(`OpenStreetMap request failed: ${message}`, 'error')
    console.error(error)
    await failLoading('Footprint detection failed', message)
  } finally {
    if (state.boundary.length >= 3) detectBtn.disabled = false
  }
})

toggleBtn.addEventListener('click', () => {
  if (state.mapDisplay !== 'proposal') return
  state.showAfter = !state.showAfter
  toggleBtn.textContent = state.showAfter ? 'Show: After' : 'Show: Before'
  restyleRooftops(state.rooftops)
})

mapDisplaySelect.addEventListener('change', () => {
  state.mapDisplay = mapDisplaySelect.value as MapDisplayMode
  updateMapDisplayUI()
  writeLog(
    state.mapDisplay === 'height'
      ? 'Map changed to building height (relative roof Z).'
      : state.mapDisplay === 'height-confidence'
        ? 'Map changed to height-data confidence.'
        : 'Map changed to the greening proposal.',
  )
})

search.addEventListener('input', () => {
  state.filter = search.value
  restyleRooftops(state.rooftops)
  renderSidebar()
})

clearBtn.addEventListener('click', () => {
  resetBoundaryWorkflow()
  writeLog('Study boundary and analysis cleared.')
})

window.addEventListener('beforeunload', () => clearMap())

updateBoundaryMethodUI()
writeLog(
  'STÉGI ready. Search within Athens, then draw or upload and confirm a study boundary.',
  'success',
)
