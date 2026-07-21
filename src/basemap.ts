// STÉGI custom vector basemap.
//
// OpenFreeMap supplies OpenStreetMap vector tiles without an API key. The
// OpenFreeMap Positron style is loaded first, then recoloured once MapLibre is
// ready so STÉGI can control buildings, roads, greenspace and water separately.

import L from 'leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@maplibre/maplibre-gl-leaflet'
import type {
  LayerSpecification,
  Map as MapLibreMap,
} from 'maplibre-gl'
import { installAthensContext } from './athensMask'

const OPENFREE_STYLE = 'https://tiles.openfreemap.org/styles/positron'
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const OPENFREE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://openfreemap.org">OpenFreeMap</a>'

export type BasemapMode = 'stegi' | 'osm'

type StyleLayer = LayerSpecification & {
  'source-layer'?: string
}

const COLOURS = {
  land: '#e7e8e6',
  landUse: '#e2e4e1',
  building: '#8b9092',
  buildingOutline: '#72787a',
  road: '#f2f2ef',
  roadCasing: '#d1d4d3',
  roadMinor: '#e9eae7',
  green: '#b9d7ae',
  greenDark: '#a7c99c',
  water: '#a7d4e8',
  waterLine: '#82b8cf',
  text: '#4e5351',
  textMuted: '#6a706d',
  textHalo: '#f4f4f1',
} as const

function descriptor(layer: StyleLayer): string {
  return `${layer.id} ${layer['source-layer'] ?? ''}`.toLowerCase()
}

function includesAny(value: string, words: readonly string[]): boolean {
  return words.some((word) => value.includes(word))
}

function safePaint(
  map: MapLibreMap,
  layerId: string,
  property: string,
  value: unknown,
): void {
  try {
    map.setPaintProperty(layerId, property, value)
  } catch {
    // Base styles occasionally omit a property for a particular layer type.
    // A missing optional treatment should never stop the map from loading.
  }
}

function safeLayout(
  map: MapLibreMap,
  layerId: string,
  property: string,
  value: unknown,
): void {
  try {
    map.setLayoutProperty(layerId, property, value)
  } catch {
    // See safePaint.
  }
}

function styleFillLayer(map: MapLibreMap, layer: StyleLayer): void {
  const key = descriptor(layer)

  const isWater = includesAny(key, ['water', 'ocean', 'sea', 'river', 'lake'])
  const isBuilding = includesAny(key, ['building'])
  const isWoodland = includesAny(key, ['wood', 'forest'])
  const isGreen = includesAny(key, [
    'park',
    'grass',
    'garden',
    'green',
    'cemetery',
    'pitch',
    'recreation',
    'nature',
    'farmland',
    'orchard',
    'vineyard',
  ])
  const isGeneralLandUse = includesAny(key, [
    'landuse',
    'landcover',
    'residential',
    'industrial',
    'commercial',
  ])

  if (isWater) {
    safePaint(map, layer.id, 'fill-color', COLOURS.water)
    safePaint(map, layer.id, 'fill-opacity', 1)
    safePaint(map, layer.id, 'fill-outline-color', COLOURS.waterLine)
    return
  }

  if (isBuilding) {
    safePaint(map, layer.id, 'fill-color', COLOURS.building)
    safePaint(map, layer.id, 'fill-opacity', 0.94)
    safePaint(map, layer.id, 'fill-outline-color', COLOURS.buildingOutline)
    return
  }

  if (isWoodland) {
    safePaint(map, layer.id, 'fill-color', COLOURS.greenDark)
    safePaint(map, layer.id, 'fill-opacity', 0.94)
    return
  }

  if (isGreen) {
    safePaint(map, layer.id, 'fill-color', COLOURS.green)
    safePaint(map, layer.id, 'fill-opacity', 0.92)
    return
  }

  if (isGeneralLandUse) {
    safePaint(map, layer.id, 'fill-color', COLOURS.landUse)
    safePaint(map, layer.id, 'fill-opacity', 0.76)
  }
}

function styleLineLayer(map: MapLibreMap, layer: StyleLayer): void {
  const key = descriptor(layer)
  const isWater = includesAny(key, ['water', 'river', 'stream', 'canal'])
  const isRoad = includesAny(key, [
    'transportation',
    'road',
    'street',
    'motorway',
    'trunk',
    'primary',
    'secondary',
    'tertiary',
    'path',
    'rail',
  ])

  if (isWater) {
    safePaint(map, layer.id, 'line-color', COLOURS.waterLine)
    safePaint(map, layer.id, 'line-opacity', 0.88)
    return
  }

  if (isRoad) {
    const isCasing = includesAny(key, ['case', 'casing', 'outline', 'bridge'])
    const isMinor = includesAny(key, ['minor', 'service', 'path', 'track'])
    safePaint(
      map,
      layer.id,
      'line-color',
      isCasing
        ? COLOURS.roadCasing
        : isMinor
          ? COLOURS.roadMinor
          : COLOURS.road,
    )
    safePaint(map, layer.id, 'line-opacity', 0.96)
  }
}

function styleSymbolLayer(map: MapLibreMap, layer: StyleLayer): void {
  const key = descriptor(layer)

  // Keep place and road names, but remove the POI clutter that competes with
  // rooftop analysis and building footprints.
  if (
    includesAny(key, [
      'poi',
      'housenumber',
      'shop',
      'amenity',
      'airport_gate',
      'transit_stop',
    ])
  ) {
    safeLayout(map, layer.id, 'visibility', 'none')
    return
  }

  const isWaterLabel = includesAny(key, ['water', 'ocean', 'sea', 'river'])
  const isRoadLabel = includesAny(key, [
    'transportation_name',
    'road',
    'street',
    'highway',
  ])

  safePaint(
    map,
    layer.id,
    'text-color',
    isWaterLabel
      ? '#4c7f96'
      : isRoadLabel
        ? COLOURS.textMuted
        : COLOURS.text,
  )
  safePaint(map, layer.id, 'text-halo-color', COLOURS.textHalo)
  safePaint(map, layer.id, 'text-halo-width', 1.2)
  safePaint(map, layer.id, 'text-halo-blur', 0.35)

  if (!isRoadLabel && !isWaterLabel) {
    safePaint(map, layer.id, 'icon-opacity', 0.56)
  }
}

function applyStegiVectorStyle(map: MapLibreMap): void {
  const style = map.getStyle()

  for (const layer of style.layers ?? []) {
    const typedLayer = layer as StyleLayer

    if (typedLayer.type === 'background') {
      safePaint(map, typedLayer.id, 'background-color', COLOURS.land)
      continue
    }

    if (typedLayer.type === 'fill') {
      styleFillLayer(map, typedLayer)
      continue
    }

    if (typedLayer.type === 'line') {
      styleLineLayer(map, typedLayer)
      continue
    }

    if (typedLayer.type === 'symbol') {
      styleSymbolLayer(map, typedLayer)
    }
  }
}

export function installBasemaps(map: L.Map): void {
  const osmDetail = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
      className: 'stegi-osm-tiles',
    },
  )

  const stegiVector = L.maplibreGL({
    style: OPENFREE_STYLE,
    attributionControl: false,
    interactive: false,
    renderWorldCopies: false,
  })

  // The MapLibre map is created by the plugin inside its Leaflet onAdd hook.
  // Add the layer first, then access getMaplibreMap(). Accessing it before
  // addTo(map) returns undefined and stops the application during start-up.
  stegiVector.addTo(map)

  const glMap = stegiVector.getMaplibreMap()
  if (!glMap) {
    console.warn(
      'The STÉGI vector map could not initialise. Falling back to OpenStreetMap.',
    )
    map.removeLayer(stegiVector)
    osmDetail.addTo(map)
    map.getContainer().dataset.basemap = 'osm'
  } else {
    const finishVectorSetup = (): void => {
      applyStegiVectorStyle(glMap)
      glMap.getCanvas().classList.add('stegi-vector-canvas')
    }

    glMap.once('load', finishVectorSetup)

    glMap.on('error', (event) => {
      console.warn('The STÉGI vector basemap reported an error.', event.error)
    })

    map.getContainer().dataset.basemap = 'stegi'
    map.attributionControl.addAttribution(OPENFREE_ATTRIBUTION)
  }

  const baseLayers: Record<string, L.Layer> = {
    'STÉGI custom map': stegiVector,
    'OpenStreetMap detail': osmDetail,
  }

  const layersControl = L.control
    .layers(baseLayers, undefined, {
      position: 'topright',
      collapsed: true,
    })
    .addTo(map)

  const controlElement = layersControl.getContainer()
  controlElement?.classList.add('stegi-layer-control')
  controlElement?.setAttribute('aria-label', 'Choose map style')
  controlElement?.setAttribute('title', 'Choose map style')

  map.on('baselayerchange', (event: L.LayersControlEvent) => {
    const mode: BasemapMode =
      event.name === 'OpenStreetMap detail' ? 'osm' : 'stegi'
    map.getContainer().dataset.basemap = mode
  })

  installAthensContext(map)

  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.control
    .scale({ position: 'bottomright', imperial: false, maxWidth: 120 })
    .addTo(map)

  map.attributionControl.setPrefix(false)
}
