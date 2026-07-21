export interface LoadingFact {
  title: string
  text: string
}

// Short educational messages shown only while the analysis is running.
// They are deliberately qualitative: STÉGI remains a workshop prototype,
// not a substitute for a project-specific environmental model.
export const LOADING_FACTS: LoadingFact[] = [
  {
    title: 'Shade first',
    text: 'External shading is usually more effective than internal blinds because it stops much of the solar gain before it reaches the glazing.',
  },
  {
    title: 'Useful daylight',
    text: 'Useful Daylight Illuminance (UDI) describes how often daylight is useful rather than too dim or excessive. More daylight is not always better.',
  },
  {
    title: 'Cool roofs',
    text: 'Light, reflective roof finishes generally absorb less solar energy than dark finishes and can reduce roof-surface temperatures.',
  },
  {
    title: 'Green-roof cooling',
    text: 'Green roofs cool through shading and evapotranspiration. Substrate depth, planting, irrigation and local weather all affect performance.',
  },
  {
    title: 'Night purging',
    text: 'Night ventilation can remove stored heat when the outdoor air is cooler, helping thermal mass start the next day at a lower temperature.',
  },
  {
    title: 'Thermal mass needs an exit',
    text: 'Thermal mass can delay overheating, but the stored heat still needs to be released later through ventilation or active cooling.',
  },
  {
    title: 'Trees do two jobs',
    text: 'Trees can cool streets by shading hard surfaces and by evapotranspiration from their leaves.',
  },
  {
    title: 'Water as part of the story',
    text: 'Vegetated roofs can slow and retain some rainfall, although their stormwater performance depends on build-up, saturation and maintenance.',
  },
  {
    title: 'Geometry matters',
    text: 'Roof area, orientation, surrounding density and nearby greenery can all influence which cooling intervention makes most sense.',
  },
]
