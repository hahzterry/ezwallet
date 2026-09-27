import logoLockup from '../../design/logo.png'
import { GRADIENT } from '../brandBg'

// SPLASH - Figma node 1:169. The loading screen: it appears while the app is still coming up, so it
// carries NO TEXT AT ALL, only the logo (user, 2026-09-23: "trong splash sẽ ko có chữ gì cả chỉ có logo").
// Nothing here waits or navigates - App.jsx decides what to render; this is purely what "not ready yet"
// looks like.
//
// ⚠️ THE POSITION/SIZE LIVE IN THE SHARED `.logo-lockup` CLASS (index.css), NOT HERE. This screen used
// to carry its own inline copy of those numbers - exactly the mistake THE LOGO RULE in index.css exists to
// prevent (see that comment). If Figma re-measures this element, edit the class, not this file.
export default function Splash() {
  return (
    <div className="screen" style={{ background: GRADIENT }}>
      <img className="logo-lockup" src={logoLockup} alt="ezwallet" />
    </div>
  )
}
