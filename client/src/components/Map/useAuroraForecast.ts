import { useEffect, useState } from 'react'
import { mapsApi } from '../../api/client'
import { buildAuroraOverlayUrl, type AuroraPoint } from './auroraOverlay'

// Module-level cache: the NOAA feed updates every few minutes and the server
// caches it for 10 too, so re-toggling or switching renderers must not refetch
// or re-render the canvas.
const TTL_MS = 10 * 60 * 1000
let cached: { url: string | null; forecastTime: string | null; at: number } | null = null
let inflight: Promise<{ url: string | null; forecastTime: string | null }> | null = null

async function load(): Promise<{ url: string | null; forecastTime: string | null }> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached
  if (!inflight) {
    inflight = mapsApi
      .aurora()
      .then(({ points, forecastTime }) => {
        const url = buildAuroraOverlayUrl((points || []) as AuroraPoint[])
        cached = { url, forecastTime: forecastTime || null, at: Date.now() }
        return cached
      })
      .finally(() => { inflight = null })
  }
  return inflight
}

/** Test hook: drop the module cache. */
export function clearAuroraForecastCache(): void {
  cached = null
  inflight = null
}

/**
 * Fetches + rasterizes the aurora forecast when `enabled`. Returns the overlay
 * data URL (null while loading, off, or when no aurora is visible anywhere).
 */
export function useAuroraForecast(enabled: boolean): { url: string | null; loading: boolean } {
  const [url, setUrl] = useState<string | null>(() => (cached ? cached.url : null))
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    setLoading(true)
    load()
      .then(res => { if (alive) setUrl(res.url) })
      .catch(err => { console.warn('[aurora] forecast unavailable:', err?.message || err) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [enabled])

  return { url: enabled ? url : null, loading }
}
