import React, { useEffect, useState } from 'react'
import { Bookmark, ArrowRight } from 'lucide-react'
import { useTranslation } from '../../i18n'
import PlaceAvatar from '../shared/PlaceAvatar'
import { collectionsApi } from '../../api/collections'
import type { CollectionPlace } from '@trek/shared'

/**
 * Dashboard sidebar widget — a glassy `.tool` card (cloned from the dashboard's
 * UpcomingTool) that surfaces the user's saved-places library: a total count
 * plus the most recently saved places. Every row and the header "→" jump to
 * /collections.
 *
 * Self-contained on purpose: it fetches its own data on mount, and it is only
 * ever mounted when BOTH gates are satisfied (admin addon enabled AND the
 * per-user widget flag on — see DashboardPage `showCollections`). That keeps the
 * data fetch strictly "only when shown" and means the dashboard never hits
 * /api/addons/collections while the addon is disabled.
 */
export default function CollectionsWidget({ onOpen }: { onOpen: () => void }): React.ReactElement {
  const { t } = useTranslation()
  const [places, setPlaces] = useState<CollectionPlace[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await collectionsApi.list()
        if (cancelled) return
        // Union every list the user owns or co-owns, deduped, newest first —
        // mirrors the store's "All saved" pseudo-list so the widget shows the
        // same recent saves the page does.
        const results = await Promise.all(data.collections.map(c => collectionsApi.get(c.id).catch(() => null)))
        if (cancelled) return
        const seen = new Set<number>()
        const merged: CollectionPlace[] = []
        for (const res of results) {
          if (!res) continue
          for (const p of res.places) {
            if (seen.has(p.id)) continue
            seen.add(p.id)
            merged.push(p)
          }
        }
        merged.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
        setCount(merged.length)
        setPlaces(merged.slice(0, 4))
      } catch {
        if (!cancelled) { setPlaces([]); setCount(0) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="tool">
      <div className="tool-head">
        <div className="tool-title"><Bookmark size={14} /> {t('collections.widget.title')}</div>
        <button className="tool-action" aria-label={t('collections.widget.title')} onClick={onOpen}>
          <ArrowRight size={14} />
        </button>
      </div>
      {loading ? null : places.length === 0 ? (
        <div className="col-empty">{t('collections.widget.empty')}</div>
      ) : (
        <>
          <div className="col-count">{t('collections.widget.savedCount', { count })}</div>
          <div className="col-list">
            {places.map(p => (
              <button key={p.id} className="col-item" onClick={onOpen}>
                <PlaceAvatar
                  place={p}
                  size={36}
                  category={p.category ? { color: p.category.color ?? undefined, icon: p.category.icon ?? undefined } : null}
                />
                <div className="col-info">
                  <div className="t">{p.name}</div>
                  <div className="s">{p.category?.name || p.address || ''}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
