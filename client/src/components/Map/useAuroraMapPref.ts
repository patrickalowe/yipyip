import { useCallback, useState } from 'react'

// Per-device preference for the aurora basemap treatment (warm tint + glow
// overlay, see `.aurora-map` in index.css). Defaults to on; persisted in
// localStorage so it survives reloads without a server round-trip. Only one
// map renderer is mounted at a time, so plain local state per component is
// enough — a freshly mounted map re-reads the stored value.
const KEY = 'yipyip_map_aurora'

export function useAuroraMapPref(): [boolean, () => void] {
  const [on, setOn] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) !== '0' } catch { return true }
  })
  const toggle = useCallback(() => {
    setOn(prev => {
      const next = !prev
      try { localStorage.setItem(KEY, next ? '1' : '0') } catch { /* private mode */ }
      return next
    })
  }, [])
  return [on, toggle]
}
