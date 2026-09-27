import { useNav } from '../nav'
import Icon from '../components/Icon'
import ScreenSheet from '../components/ScreenSheet'
import ExitBar from '../components/ExitBar'
import { GRADIENT } from '../brandBg'

const VERSION = '0.1.0'

// ABOUT - Figma node 58:424, rebuilt 2026-09-24 against the 2026-09-23 redesign's gradient+sheet shell
// (was the pre-redesign plain-white `.screen`/row-10-single "Back" layout).
// ⚠️ FIGMA'S CARD (node 58:430) IS EMPTY - no text layers at all, unlike Security's own card which fully
// spells out its rows. That almost certainly means this frame's content hasn't been drawn yet (the
// two-sources-of-truth rule treats a blank export as incomplete, not as "delete everything"; About.md's
// own real info - version, network, links - is functional content the app still needs to show). Kept the
// existing 7 rows and their already-correct grid positions (same 86px-cadence card this redesign uses
// elsewhere, re-verified: they land inside the new card's 86-672 span with no change needed), migrated
// only the shell + card colour (#D2DCE6 = var(--color-card), was --color-surface) to match Security/Menu.
// Flag to the user if Figma is later filled in with different content than this.
const ITEMS = [
  { label: 'App', value: 'Monyuny', top: '14.34dvh' },
  { label: 'Version', value: VERSION, top: '24.53dvh' },
  { label: 'Network', value: 'Arc Mainnet', top: '34.72dvh' },
  { label: 'Wallet', value: 'Circle Wallet', top: '44.91dvh' },
  { label: 'TikTok', link: 'https://tiktok.com/@monyuny', top: '55.09dvh' },
  { label: 'Term of use', link: 'https://www.circle.com/en/legal/privacy-policy', top: '65.28dvh' },
  { label: 'Privacy policy', link: 'https://www.circle.com/en/legal/privacy-policy', top: '75.47dvh' },
]

export default function About() {
  const { navigate } = useNav()

  return (
    <div className="screen" style={{ background: GRADIENT }}>
      <ScreenSheet />
      <div className="sheet-title">About</div>

      <div style={{ position: 'absolute', left: '6.41%', top: '10.19dvh', width: '87.18%', height: '69.43dvh', background: 'var(--color-card)', borderRadius: 16 }} />

      {ITEMS.map(({ label, value, link, top }) => (
        link ? (
          <button key={label} onClick={() => window.open(link, '_blank')}
            style={{ position: 'absolute', left: '7.95%', right: '9.23%', top, transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
            <Icon name="right2" size={17} color="var(--color-brand)" />
            <span style={{ fontSize: 18, fontWeight: 'var(--fw-semibold)', color: 'var(--color-black)' }}>{label}</span>
          </button>
        ) : (
          <div key={label} style={{ position: 'absolute', left: '9.23%', right: '9.23%', top, transform: 'translateY(-50%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18, fontWeight: 'var(--fw-semibold)', flexShrink: 0 }}>{label}</span>
            <span style={{ fontSize: 17, color: 'var(--color-muted-2)', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
          </div>
        )
      ))}

      <button className="btn btn-primary" onClick={() => navigate('MenuScreen')}
        style={{ position: 'absolute', left: '6.41%', width: '87.18%', top: '82.82dvh', height: 48, minHeight: 0 }}>
        Done
      </button>

      <ExitBar onClick={() => navigate('MenuScreen')} />
    </div>
  )
}
