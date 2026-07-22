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

interface ParsedAddress {
  houseNumber: string
  streetName: string
  postcode: string | null
  city: string
}

interface SearchAttempt {
  cacheKey: string
  params: URLSearchParams
}

const SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search'
const MIN_REQUEST_GAP_MS = 1_100
const REQUEST_TIMEOUT_MS = 15_000

let lastRequestStartedAt = 0
const resultCache = new Map<string, NominatimResult[]>()

function cleanAddress(rawAddress: string): string {
  return rawAddress
    .trim()
    .replace(/[;,]+/g, ',')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
}

function compactGreekPostcode(value: string): string {
  return value.replace(/\b(\d{3})\s+(\d{2})\b/g, '$1$2')
}

function stripStreetSuffix(value: string): string {
  return value
    .replace(
      /\s+\b(street|st|str|road|rd|avenue|ave|boulevard|blvd)\.?\s*$/i,
      '',
    )
    .trim()
}

function parseAddress(rawAddress: string): ParsedAddress | null {
  const address = cleanAddress(rawAddress)
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean)

  if (parts.length === 0) return null

  const streetPart = stripStreetSuffix(parts[0])
  const streetMatch = streetPart.match(
    /^(\d+[A-Za-zΑ-Ωα-ω]?(?:[-/]\d+[A-Za-zΑ-Ωα-ω]?)?)\s+(.+)$/u,
  )

  if (!streetMatch) return null

  const remaining = parts.slice(1).join(', ')
  const postcodeMatch = remaining.match(/\b(\d{3})\s*(\d{2})\b/)
  const postcode = postcodeMatch
    ? `${postcodeMatch[1]}${postcodeMatch[2]}`
    : null

  const cityText = remaining
    .replace(/\b\d{3}\s*\d{2}\b/g, '')
    .replace(/\b(greece|hellas|attica)\b/gi, '')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim()

  return {
    houseNumber: streetMatch[1],
    streetName: stripStreetSuffix(streetMatch[2]),
    postcode,
    city: cityText || 'Athens',
  }
}

function commonParams(): Record<string, string> {
  return {
    format: 'jsonv2',
    limit: '20',
    countrycodes: 'gr',
    viewbox: ATHENS_NOMINATIM_VIEWBOX,
    addressdetails: '1',
    dedupe: '1',
    'accept-language': 'en,el',
  }
}

function freeFormAttempt(query: string): SearchAttempt {
  const params = new URLSearchParams({
    ...commonParams(),
    q: query,
  })

  return {
    cacheKey: `free:${query.toLocaleLowerCase()}`,
    params,
  }
}

function structuredAttempt(
  parsed: ParsedAddress,
  streetValue: string,
): SearchAttempt {
  const values: Record<string, string> = {
    ...commonParams(),
    street: streetValue,
    city: parsed.city,
    country: 'Greece',
    layer: 'address',
  }

  if (parsed.postcode) {
    values.postalcode = parsed.postcode
  }

  const params = new URLSearchParams(values)

  return {
    cacheKey: `structured:${params.toString().toLocaleLowerCase()}`,
    params,
  }
}

function addUniqueAttempt(
  attempts: SearchAttempt[],
  seen: Set<string>,
  attempt: SearchAttempt,
): void {
  if (seen.has(attempt.cacheKey)) return
  seen.add(attempt.cacheKey)
  attempts.push(attempt)
}

function buildSearchAttempts(rawAddress: string): SearchAttempt[] {
  const address = cleanAddress(rawAddress)
  const attempts: SearchAttempt[] = []
  const seen = new Set<string>()
  const parsed = parseAddress(address)

  if (parsed) {
    const normalStreet = `${parsed.houseNumber} ${parsed.streetName}`
    const reversedStreet = `${parsed.streetName} ${parsed.houseNumber}`
    const postcodePart = parsed.postcode ? `, ${parsed.postcode}` : ''

    // Structured lookup is usually more reliable for a known house number.
    addUniqueAttempt(
      attempts,
      seen,
      structuredAttempt(parsed, normalStreet),
    )
    addUniqueAttempt(
      attempts,
      seen,
      structuredAttempt(parsed, reversedStreet),
    )

    // Nominatim may index Greek addresses in either number-first or
    // street-first order, so try both clean free-form versions.
    addUniqueAttempt(
      attempts,
      seen,
      freeFormAttempt(
        `${normalStreet}${postcodePart}, ${parsed.city}, Greece`,
      ),
    )
    addUniqueAttempt(
      attempts,
      seen,
      freeFormAttempt(
        `${reversedStreet}${postcodePart}, ${parsed.city}, Greece`,
      ),
    )

    // A postcode can occasionally over-constrain an otherwise valid address.
    if (parsed.postcode) {
      addUniqueAttempt(
        attempts,
        seen,
        freeFormAttempt(`${normalStreet}, ${parsed.city}, Greece`),
      )
      addUniqueAttempt(
        attempts,
        seen,
        freeFormAttempt(`${reversedStreet}, ${parsed.city}, Greece`),
      )
    }
  }

  // Keep the user's exact wording as a final address/POI attempt.
  addUniqueAttempt(attempts, seen, freeFormAttempt(address))

  const alreadyNamesRegion =
    /\b(athens|athina|piraeus|peiraias|kifisia|glyfada|marousi|peristeri)\b|αθήνα|αθηνα|πειραιά|πειραια/i.test(
      address,
    )

  if (!alreadyNamesRegion) {
    addUniqueAttempt(
      attempts,
      seen,
      freeFormAttempt(`${address}, Athens, Greece`),
    )
    addUniqueAttempt(
      attempts,
      seen,
      freeFormAttempt(`${address}, Attica, Greece`),
    )
  }

  // Also try a version with a compact five-digit Greek postcode and without
  // English street abbreviations such as "St.".
  const normalised = compactGreekPostcode(
    address.replace(
      /\s+\b(street|st|str|road|rd|avenue|ave|boulevard|blvd)\.?(?=\s*,|$)/gi,
      '',
    ),
  )

  if (normalised !== address) {
    addUniqueAttempt(attempts, seen, freeFormAttempt(normalised))
  }

  return attempts
}

async function respectRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestStartedAt
  const waitMs = Math.max(0, MIN_REQUEST_GAP_MS - elapsed)

  if (waitMs > 0) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, waitMs))
  }

  lastRequestStartedAt = Date.now()
}

async function fetchResults(
  attempt: SearchAttempt,
): Promise<NominatimResult[]> {
  const cached = resultCache.get(attempt.cacheKey)
  if (cached) return cached

  await respectRateLimit()

  const controller = new AbortController()
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  )

  try {
    const response = await fetch(
      `${SEARCH_ENDPOINT}?${attempt.params.toString()}`,
      {
        method: 'GET',
        mode: 'cors',
        headers: {
          Accept: 'application/json',
        },
        referrerPolicy: 'strict-origin-when-cross-origin',
        signal: controller.signal,
      },
    )

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(
          'The address service is receiving too many requests. Wait a moment and try again.',
        )
      }

      if (response.status === 403) {
        throw new Error(
          'The address service refused the request. Make sure STÉGI is running through Vite rather than opening index.html directly.',
        )
      }

      throw new Error(`Address search failed (${response.status}).`)
    }

    const results = (await response.json()) as NominatimResult[]
    resultCache.set(attempt.cacheKey, results)
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

function firstGreaterAthensMatch(
  results: NominatimResult[],
): GeocodeResult | null {
  for (const result of results) {
    const lat = Number(result.lat)
    const lng = Number(result.lon)

    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      isInsideAthens(lat, lng)
    ) {
      return {
        lat,
        lng,
        displayName: result.display_name,
      }
    }
  }

  return null
}

export async function geocodeAthensAddress(
  rawAddress: string,
): Promise<GeocodeResult> {
  const address = cleanAddress(rawAddress)
  if (!address) throw new Error('Enter an address first.')

  for (const attempt of buildSearchAttempts(address)) {
    const match = firstGreaterAthensMatch(await fetchResults(attempt))
    if (match) return match
  }

  throw new Error(
    'No matching address was found inside Greater Athens. Try “building number, street, postcode, district”, or search for a nearby landmark.',
  )
}
