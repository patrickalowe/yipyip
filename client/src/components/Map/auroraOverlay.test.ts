import { describe, it, expect } from 'vitest'
import { buildAuroraGrid, sampleAurora, auroraColor, type AuroraPoint } from './auroraOverlay'

describe('auroraOverlay', () => {
  it('AURORA-OVL-001: grid round-trips points and samples bilinearly between cells', () => {
    const points: AuroraPoint[] = [
      [200, 65, 40],
      [201, 65, 80],
    ]
    const grid = buildAuroraGrid(points)
    expect(sampleAurora(grid, 200, 65)).toBe(40)
    expect(sampleAurora(grid, 201, 65)).toBe(80)
    // halfway between the two cells → bilinear midpoint
    expect(sampleAurora(grid, 200.5, 65)).toBeCloseTo(60)
    // empty cells stay zero
    expect(sampleAurora(grid, 10, -30)).toBe(0)
  })

  it('AURORA-OVL-002: longitude sampling wraps across the antimeridian', () => {
    const grid = buildAuroraGrid([[359, 70, 100], [0, 70, 50]])
    // between lon 359 and lon 0 (=360) the wrap interpolates, not zeroes
    expect(sampleAurora(grid, 359.5, 70)).toBeCloseTo(75)
    // negative lons (the -180..180 canvas space) index the same cells
    expect(sampleAurora(grid, -1, 70)).toBe(100)
  })

  it('AURORA-OVL-003: color ramp is transparent below threshold and ramps green → red', () => {
    expect(auroraColor(0)[3]).toBe(0)
    expect(auroraColor(2)[3]).toBe(0)
    const low = auroraColor(10) // green territory
    expect(low[1]).toBeGreaterThan(low[0])
    expect(low[3]).toBeGreaterThan(0)
    const high = auroraColor(90) // red territory
    expect(high[0]).toBeGreaterThan(high[1])
    // alpha grows with probability but stays below full opacity
    expect(high[3]).toBeGreaterThan(low[3])
    expect(high[3]).toBeLessThanOrEqual(Math.round(0.85 * 255))
  })
})
