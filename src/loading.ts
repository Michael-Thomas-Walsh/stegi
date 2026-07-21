import { LOADING_FACTS } from './facts'

const FACT_ROTATION_INTERVAL_MS = 7000
const LONG_WAIT_DELAY_MS = 60_000

let overlay: HTMLElement | null = null
let titleElement: HTMLElement | null = null
let detailElement: HTMLElement | null = null
let progressElement: HTMLProgressElement | null = null
let progressLabelElement: HTMLElement | null = null
let factTitleElement: HTMLElement | null = null
let factTextElement: HTMLElement | null = null
let longWaitElement: HTMLElement | null = null
let factTimer: number | null = null
let longWaitTimer: number | null = null
let factIndex = 0

const clampProgress = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)))

function setFact(index: number): void {
  if (!factTitleElement || !factTextElement || LOADING_FACTS.length === 0) return

  const fact = LOADING_FACTS[index % LOADING_FACTS.length]
  factTitleElement.textContent = fact.title
  factTextElement.textContent = fact.text
}

function startFactRotation(): void {
  stopFactRotation()

  // Always begin at the first fact, then advance at one fixed interval.
  // This ensures every message receives exactly the same display time and
  // the final message loops cleanly back to the first.
  factIndex = 0
  setFact(factIndex)

  factTimer = window.setInterval(() => {
    factIndex = (factIndex + 1) % LOADING_FACTS.length
    setFact(factIndex)
  }, FACT_ROTATION_INTERVAL_MS)
}

function stopFactRotation(): void {
  if (factTimer !== null) {
    window.clearInterval(factTimer)
    factTimer = null
  }
}

function startLongWaitTimer(): void {
  stopLongWaitTimer()
  if (!longWaitElement) return

  longWaitElement.hidden = true
  longWaitTimer = window.setTimeout(() => {
    if (longWaitElement) longWaitElement.hidden = false
    longWaitTimer = null
  }, LONG_WAIT_DELAY_MS)
}

function stopLongWaitTimer(): void {
  if (longWaitTimer !== null) {
    window.clearTimeout(longWaitTimer)
    longWaitTimer = null
  }

  if (longWaitElement) longWaitElement.hidden = true
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Could not find loading element #${id}.`)
  return element as T
}

export function initialiseLoading(): void {
  overlay = requireElement('loading-overlay')
  titleElement = requireElement('loading-title')
  detailElement = requireElement('loading-detail')
  progressElement = requireElement<HTMLProgressElement>('loading-progress')
  progressLabelElement = requireElement('loading-progress-label')
  factTitleElement = requireElement('loading-fact-title')
  factTextElement = requireElement('loading-fact-text')
  longWaitElement = requireElement('loading-long-wait')
}

export function showLoading(
  title: string,
  detail: string,
  progress = 5,
): void {
  if (!overlay) initialiseLoading()

  overlay!.hidden = false
  overlay!.classList.remove('is-error')
  document.body.setAttribute('aria-busy', 'true')
  startFactRotation()
  startLongWaitTimer()
  updateLoading(title, detail, progress)
}

export function updateLoading(
  title: string,
  detail: string,
  progress: number,
): void {
  if (!overlay) initialiseLoading()

  const value = clampProgress(progress)
  titleElement!.textContent = title
  detailElement!.textContent = detail
  progressElement!.value = value
  progressLabelElement!.textContent = `${value}%`
}

function hideImmediately(): void {
  if (!overlay) return
  overlay.hidden = true
  overlay.classList.remove('is-error')
  document.body.removeAttribute('aria-busy')
  stopFactRotation()
  stopLongWaitTimer()
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

export async function completeLoading(
  title = 'Analysis complete',
  detail = 'The rooftop results are ready.',
): Promise<void> {
  stopLongWaitTimer()
  updateLoading(title, detail, 100)
  await wait(500)
  hideImmediately()
}

export async function failLoading(
  title: string,
  detail: string,
): Promise<void> {
  if (!overlay) initialiseLoading()
  overlay!.classList.add('is-error')
  updateLoading(title, detail, progressElement?.value ?? 0)
  stopFactRotation()
  stopLongWaitTimer()
  await wait(1200)
  hideImmediately()
}

export function closeLoading(): void {
  hideImmediately()
}

// Allows the browser to paint a new loading stage before the next synchronous
// analysis step begins.
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
}
