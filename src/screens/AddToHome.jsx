import { useNav } from '../nav'
import Icon from '../components/Icon'
import { bootTarget, A2HS_KEY } from '../boot'
import logoIcon from '../../design/logo-icon.svg'
import arrowDown from '../../design/arrow-down.svg'

// ADD TO HOME SCREEN - Figma node 48:350 ("Add"), the FIRST screen of the app on a mobile browser.
// Every coordinate below is an exact conversion of that node's own numbers, same convention as the rest
// of the app: x = px/390 as a %, y = px/844 as dvh. Nothing here is inherited from another screen.
//
// The gate that decides whether this screen runs at all lives in `src/boot.js` (shouldOfferInstall).
//
// ⚠️ The background is a GRADIENT, which the old BRAND-GUIDELINE.md forbids ("tất cả là màu SOLID").
// The user settled this directly on 2026-09-23: "Figma là nguồn sự thật, guideline cũ rồi." Do not
// "fix" this back to a solid fill.
const GRADIENT = 'linear-gradient(204.80096509205717deg, #FFFFFF 50%, #0B53BF 100%)'

// The five rows of the fake iOS share sheet (node 48:358). Only the LAST one is legible - the four
// above it are blurred, because the point of the picture is to show the user which line to look for,
// not to be a working menu. `blur` mirrors Figma's own per-layer blur.
// ⚠️ The Figma file spells this "Favarites". Corrected to "Favorites" on the user's instruction
// 2026-09-23, confirmed against their photo of the real iOS share sheet, which reads "Add to
// Favorites". THE FIGMA FILE STILL HAS THE TYPO - so a future pixel-diff of node 48:350 will show a
// mismatch on this row. That is the design being wrong, not the code.
const SHEET_ROWS = [
  { label: 'Add Bookmark to...', icon: 'bookmark',  blur: true },
  { label: 'Add to Favorites'  ,   icon: 'star',      blur: true },
  { label: 'Add to Quick Note',  icon: 'note',      blur: true },
  { label: 'Find on Page',       icon: 'find',      blur: true },
  { label: 'Add to Home Screen', icon: 'addSquare', blur: false },
]

// "ez" is always brand blue inside a run of black text - the wordmark rule, applied in running copy.
function Ez() {
  return <span style={{ color: 'var(--color-brand)' }}>ez</span>
}

export default function AddToHome() {
  const { navigate } = useNav()

  // Skip is permanent (node 48:376). Writing the flag BEFORE navigating means a crash on the next
  // screen still cannot resurrect this one.
  function skip() {
    try { localStorage.setItem(A2HS_KEY, '1') } catch {}
    const t = bootTarget()
    navigate(t.screen, t.params)
  }

  return (
    <div className="screen" style={{ background: GRADIENT }}>

      {/* Skip - node 48:376: centre (325.6, 35) of 390x844, 16px, tracking -0.64. A real button, not a
          text span: it is the only control on the screen and has to be reachable by keyboard. */}
      <button
        onClick={skip}
        style={{
          position: 'absolute', left: '83.49%', top: '4.15dvh', transform: 'translate(-50%, -50%)',
          background: 'none', border: 'none', padding: 8, cursor: 'pointer',
          fontSize: 16, lineHeight: '20px', letterSpacing: '-0.64px', color: 'var(--color-muted-2)',
          WebkitTapHighlightColor: 'transparent',
        }}>
        Skip →
      </button>

      {/* Logo - node 48:352: 81.643x70 at y=172, horizontally centred. The BLUE mark (design/logo-icon.svg);
          the white variant the user also supplied would be invisible on this screen's white half. */}
      <img
        src={logoIcon} alt=""
        style={{
          position: 'absolute', left: '50%', top: '20.38dvh', transform: 'translateX(-50%)',
          width: '20.93%', height: '8.29dvh',
        }} />

      {/* Title - node 48:356: 20px semibold, line-height 30, centred on (195, 275.5). */}
      <div style={{
        position: 'absolute', left: '50%', top: '32.64dvh', transform: 'translate(-50%, -50%)',
        width: '87.18%', textAlign: 'center',
        fontSize: 20, fontWeight: 'var(--fw-semibold)', lineHeight: '30px', color: 'var(--color-black)',
      }}>
        <Mon />Yuny works best as an app
      </div>

      {/* Sub-title - node 48:357: 16px regular, line-height 24, centred on (195, 310.5). */}
      <div style={{
        position: 'absolute', left: '50%', top: '36.79dvh', transform: 'translate(-50%, -50%)',
        width: '87.18%', textAlign: 'center',
        fontSize: 16, fontWeight: 'var(--fw-normal)', lineHeight: '24px', color: 'var(--color-black)',
      }}>
        Add <Mon />Yuny to your home screen:
      </div>

      {/* The two steps - box node 48:359 (340x70 @ 25,344, radius 8, #D2DCE6) with the list node 48:374
          sitting on top of it (18px semibold, line-height 32, 324 wide). One element here, not two:
          the box exists only to hold the list, so the list IS the box's content. */}
      <ol style={{
        position: 'absolute', left: '6.41%', top: '40.76dvh',
        width: '87.18%', height: '8.29dvh',
        background: '#D2DCE6', borderRadius: 8,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        listStyle: 'decimal', listStylePosition: 'inside',
        fontSize: 18, fontWeight: 'var(--fw-semibold)', lineHeight: '32px',
        color: 'var(--color-black)', textAlign: 'center',
      }}>
        <li>Tap Options, then tap Share</li>
        <li>Tap Add to Home Screen</li>
      </ol>

      {/* The fake iOS share sheet - node 48:358: 274x242 @ (58,430), white, 1px brand border, radius 16.
          Inside it, five evenly-split rows separated by hairlines - the hairlines are blurred TOO
          (Figma bakes a gaussian filter into the divider asset itself, `filter0_f_0_4`). The user's
          rule, 2026-09-23: the blur is deliberate and ONLY the "Add to Home Screen" row and its icon
          stay sharp. Everything else on this picture - text, icons, rules - is soft.
          The rows are laid out with flex rather
          than five absolute coordinates: they are one repeated object, and Figma's own y values for them
          (29.3 / 76.0 / 121.5 / 167.1 / 212.7 from the box top) are an even 45.6px step. */}
      <div style={{
        position: 'absolute', left: '14.87%', top: '50.95dvh',
        width: '70.26%', height: '28.67dvh',
        background: 'var(--color-white)', border: '1px solid var(--color-brand)', borderRadius: 16,
        padding: '5px 0', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {SHEET_ROWS.map((row, i) => (
          <div key={row.label} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Hairline ABOVE every row but the first - node 48:368/369/372/373: #94A3B8, and inset to
                start at the TEXT, not at the icon, exactly as a real iOS menu draws it. */}
            {i > 0 && (
              <div style={{
                height: 1, background: 'var(--color-muted)',
                marginLeft: '18.04%', marginRight: '7.86%',
                filter: 'blur(2px)',
              }} />
            )}
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center',
              paddingLeft: '7.54%', gap: '3.19%',
              filter: row.blur ? 'blur(2px)' : 'none',
            }}>
              {/* Figma draws a flat 20x20 blue SQUARE at each of these (nodes 48:361/363/365/367/371).
                  The user settled what they mean on 2026-09-23: they are PLACEHOLDERS - "vào thư viện
                  icon, tìm cái tương tự rồi add vào" - so each one carries the icon iOS actually draws
                  on that row, matched against the user's screenshot of the real share sheet. */}
              <Icon name={row.icon} size={20} color="var(--color-brand)" />
              <span style={{ fontSize: 14, color: 'var(--color-brand)', whiteSpace: 'nowrap' }}>{row.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* The arrow pointing down at the browser's own Share button - node 52:26: 40x45.94, white,
          sitting on the blue half of the gradient.
          ⚠️ MOVED 2026-09-23 by the user, from (308,786) to (320,774). Re-read off the node, not nudged
          by eye: x 320.0087 / 390 = 82.05%, y 774 / 844 = 91.71dvh. */}
      <img
        src={arrowDown} alt=""
        style={{ position: 'absolute', left: '82.05%', top: '91.71dvh', width: 40, height: 45.94 }} />

    </div>
  )
}
