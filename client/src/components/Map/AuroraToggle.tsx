import { Sparkles } from 'lucide-react'
import { useTranslation } from '../../i18n'

interface Props {
  on: boolean
  onToggle: () => void
}

// Round on-map FAB (bottom-left, mirroring LocationButton bottom-right) that
// toggles the aurora basemap treatment. Active state fills with the accent so
// on/off is readable without relying on color alone (icon + title flip too).
export default function AuroraToggle({ on, onToggle }: Props) {
  const { t } = useTranslation()
  const label = t(on ? 'map.hideAurora' : 'map.showAurora')

  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-pressed={on}
      data-testid="aurora-toggle"
      style={{
        position: 'absolute',
        bottom: 'calc(var(--bottom-nav-h, 0px) + 20px)',
        left: 12,
        zIndex: 1000,
        width: 42,
        height: 42,
        borderRadius: '50%',
        border: 'none',
        cursor: 'pointer',
        background: on ? 'var(--accent)' : 'var(--bg-card, white)',
        color: on ? 'var(--accent-text, white)' : 'var(--text-muted, #6b7280)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.2s, color 0.2s',
      }}
    >
      <Sparkles size={20} strokeWidth={on ? 2.5 : 2} />
    </button>
  )
}
