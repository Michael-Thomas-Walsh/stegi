import {
  ATHENS_NOMINATIM_VIEWBOX,
  isInsideAthens,
} from './athens'

export interface GeocodeResult {
  lat: number
  lng: number
  displayName: string
}

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
}

// STÉGI is a browser application, unlike the Python/Streamlit BNG app.
// The browser therefore calls Nominatim directly and identifies the app through
// the normal HTTP Referer header. Searches only run when the user submits the
// form; this is not an autocomplete service.
const SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search'
const MIN_REQUEST_GAP_MS = 1_100
const REQUEST_TIMEOUT_MS = 15_000

let lastRequestStartedAt = 0
const resultCache = new Map<string, NominatimResult[]>()

function cleanAddress(rawAddress: string): string {
  return rawAddress.trim().replace(/\s+/g, ' ')
}

function athensQuery(rawAddress: string): string {
  const address = cleanAddress(rawAddress)
  const alreadyNamesAthens = /\b(athens|athina)\b|αθήνα|αθηνα/i.test(address)

  return alreadyNamesAthens ? address : `${address}, Athens, Greece`
}

async function respectRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestStartedAt
  const waitMs = Math.max(0, MIN_REQUEST_GAP_MS - elapsed)

  if (waitMs > 0) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, waitMs))
  }

  lastRequestStartedAt = Date.now()
}

async function fetchResults(query: string): Promise<NominatimResult[]> {
  const cacheKey = query.toLocaleLowerCase()
  const cached = resultCache.get(cacheKey)
  if (cached) return cached

  await respectRateLimit()

  const params = new URLSearchParams({
    format: 'jsonv2',
    q: query,
    limit: '10',
    countrycodes: 'gr',
    viewbox: ATHENS_NOMINATIM_VIEWBOX,
    addressdetails: '1',
    dedupe: '1',
    'accept-language': 'en,el',
  })

  const controller = new AbortController()
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  )

  try {
    const response = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, {
      method: 'GET',
      mode: 'cors',
      headers: {
        Accept: 'application/json',
      },
      referrerPolicy: 'strict-origin-when-cross-origin',
      signal: controller.signal,
    })

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(
          'The address service is receiving too many requests. Wait a moment and try again.',
        )
      }

      if (response.status === 403) {
        throw new Error(
          'The address service refused the request. Check that the app is running through Vite rather than opening index.html directly.',
        )
      }

      throw new Error(`Address search failed (${response.status}).`)
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      throw new Error('The address service returned an unexpected response.')
    }

    const results = (await response.json()) as NominatimResult[]
    resultCache.set(cacheKey, results)
    return results
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The address search timed out. Please try again.')
    }

    if (error instanceof TypeError) {
      console.error('Address search network/CORS error:', error)
      throw new Error(
        'The address service could not be reached. Check your internet connection and try again.',
      )
    }

    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function geocodeAthensAddress(
  rawAddress: string,
): Promise<GeocodeResult> {
  const address = cleanAddress(rawAddress)
  if (!address) throw new Error('Enter an address first.')

  const results = await fetchResults(athensQuery(address))

  // The viewbox ranks Athens results; this explicit check enforces the project
  // study limit after the search response is received.
  const match = results.find((result) => {
    const lat = Number(result.lat)
    const lng = Number(result.lon)

    return Number.isFinite(lat) && Number.isFinite(lng) && isInsideAthens(lat, lng)
  })

  if (!match) {
    throw new Error(
      'No matching address was found inside the Athens study area. Enter one address, postcode or landmark at a time.',
    )
  }

  return {
    lat: Number(match.lat),
    lng: Number(match.lon),
    displayName: match.display_name,
  }
}
