// ── Aurora forecast overlay ──────────────────────────────────────────────────
// Turns NOAA's OVATION probability grid (1°×1°, [lon 0..359, lat -90..90, %])
// into a web-mercator-projected translucent PNG that both renderers can drape
// over the world: Leaflet stretches an ImageOverlay linearly in projected
// space and MapLibre's image source does the same, so a canvas whose rows are
// laid out in mercator y renders geographically correct on both.

export type AuroraPoint = [number, number, number]

// Full web-mercator latitude extent — the overlay spans the whole projected square.
export const AURORA_LAT_MAX = 85.05112878

const GRID_W = 360
const GRID_H = 181 // lat -90..90 inclusive

/** Dense lookup grid from the sparse point list. */
export function buildAuroraGrid(points: AuroraPoint[]): Float32Array {
  const grid = new Float32Array(GRID_W * GRID_H)
  for (const [lon, lat, p] of points) {
    const x = Math.round(lon) % GRID_W
    const y = Math.round(lat) + 90
    if (x >= 0 && y >= 0 && y < GRID_H) grid[y * GRID_W + x] = p
  }
  return grid
}

/** Bilinear sample of the grid at fractional lon (0..360) / lat (-90..90). */
export function sampleAurora(grid: Float32Array, lon: number, lat: number): number {
  const gx = ((lon % 360) + 360) % 360
  const gy = Math.min(Math.max(lat + 90, 0), GRID_H - 1)
  const x0 = Math.floor(gx), y0 = Math.floor(gy)
  const x1 = (x0 + 1) % GRID_W, y1 = Math.min(y0 + 1, GRID_H - 1)
  const fx = gx - x0, fy = gy - y0
  const top = grid[y0 * GRID_W + x0] * (1 - fx) + grid[y0 * GRID_W + x1] * fx
  const bot = grid[y1 * GRID_W + x0] * (1 - fx) + grid[y1 * GRID_W + x1] * fx
  return top * (1 - fy) + bot * fy
}

/**
 * SWPC-style ramp: green (faint) → yellow → red (strong), transparent below
 * 3 %. Returns [r, g, b, a] with a 0..255.
 */
export function auroraColor(p: number): [number, number, number, number] {
  if (p < 3) return [0, 0, 0, 0]
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)
  let r: number, g: number, b: number
  if (p < 40) {
    const t = (p - 3) / 37
    ;[r, g, b] = [lerp(16, 250, t), lerp(185, 204, t), lerp(129, 21, t)]
  } else if (p < 80) {
    const t = (p - 40) / 40
    ;[r, g, b] = [lerp(250, 239, t), lerp(204, 68, t), lerp(21, 68, t)]
  } else {
    ;[r, g, b] = [239, 68, 68]
  }
  const a = Math.round(Math.min(0.85, 0.12 + (p / 100) * 1.2) * 255)
  return [r, g, b, a]
}

/**
 * Render the grid into a mercator-projected translucent PNG data URL.
 * Returns null when nothing is visible (empty forecast) or in environments
 * without canvas 2D (jsdom tests).
 */
export function buildAuroraOverlayUrl(points: AuroraPoint[], size = 1024): string | null {
  if (!points.length) return null
  const grid = buildAuroraGrid(points)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const img = ctx.createImageData(size, size)
  const data = img.data
  for (let y = 0; y < size; y++) {
    // inverse web-mercator: canvas row → latitude
    const n = Math.PI * (1 - (2 * y) / size)
    const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI
    for (let x = 0; x < size; x++) {
      // canvas spans lon -180..180 (overlay bounds); sampleAurora wraps into
      // the grid's 0..359-east indexing.
      const lon = -180 + (360 * x) / size
      const p = sampleAurora(grid, lon, lat)
      const [r, g, b, a] = auroraColor(p)
      const i = (y * size + x) * 4
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}
