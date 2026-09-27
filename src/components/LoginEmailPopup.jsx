import { useState } from 'react'
import { useNav } from '../nav'
import { createSession, createEmailToken, getSDK, initializeWallet, executeChallenge, getWalletAddress, circleErrorMessage } from '../circle'

// "LOG IN WITH EMAIL" - Figma node 1:193. A POPUP OVER THE LOGIN SCREEN, not a screen of its own; the
// user settled this on 2026-09-23: "nó là popup hiện ra ngay màn Login, là chặn cửa ko cho người khác
// vào app, nó k phải 1 màn riêng". It used to be src/screens/EnterEmail.jsx - that file is gone and all
// of its authentication logic moved here UNCHANGED. Only the layout was rewritten.
//
// Coordinates are node 1:193's own numbers in the app's usual convention (x = px/390 as %, y = px/844
// as dvh), measured against the SCREEN rather than the card, exactly like every other screen.

const DOMAINS = ['@gmail.com', '@yahoo.com', '@icloud.com']
const APP_ID = '518fec6a-4680-5175-9de6-0810fb3dfd04'
// ✅ Email OTP: signing in requires the CODE mailed to you → only the mailbox owner gets in (closing the "anyone who
// types your email is in" hole). Needs SMTP configured in Circle Console (done 2026-07-05). Flag off = back to the old
// direct-email flow (PIN, NO email verification) if OTP has problems.
// TESTED (2026-07-05): OTP users sign with the Confirmation UI and have NO PIN → losing the guard against family
// members + a "Contract Interaction" screen that baffles older users. → TURNED OFF, back to Email+PIN. Re-enable when
// Circle lets social/OTP use a PIN (or the confirm UI can be customised properly). The OTP code stays, only this flag flips.
const EMAIL_OTP_ENABLED = true

function getEmailHistory() {
  try { return JSON.parse(localStorage.getItem('ez_email_history') || '[]') } catch { return [] }
}

function saveEmailHistory(email) {
  const hist = getEmailHistory().filter(e => e !== email)
  hist.unshift(email)
  localStorage.setItem('ez_email_history', JSON.stringify(hist.slice(0, 5)))
}

// The suggestion chip - node 1:204 / 7:33: 32 tall, RADIUS 8 (not a pill: the exported path's corner is
// `a 8 8` and the shared app-wide hint chip's 999 would be visibly rounder), 1px brand border on white,
// 14px brand text. Figma stacks two of them on a 42px step (32 tall + a 10px gap).
function Chip({ label, onClick, top }) {
  return (
    <button onClick={onClick} title={label}
      style={{
        position: 'absolute', left: '10.51%', top, height: 32, maxWidth: '79%',
        padding: '0 12px', border: '1px solid var(--color-brand)', borderRadius: 8,
        background: 'var(--color-white)', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 14, color: 'var(--color-brand)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
      {label}
    </button>
  )
}

export default function LoginEmailPopup({ onClose }) {
  const { navigate } = useNav()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const showDomains = email.length > 0 && !email.includes('@')
  const history = getEmailHistory()
  const suggestions = email.length === 0
    ? history
    : history.filter(e => e.toLowerCase().startsWith(email.toLowerCase()) && e !== email)

  function applyDomain(d) { setEmail(e => e + d); setError('') }

  // Once a userToken exists (from OTP): create the wallet (if missing) → challenge (PIN or Approve, Circle's choice) →
  // fetch the address → into Home. OTP users refresh their token with refreshToken (like Google), and do NOT set ez_email.
  async function finishOtpLogin(result, emailStr, deviceId) {
    const { userToken, encryptionKey, refreshToken } = result
    localStorage.setItem('ez_user_token', userToken)
    localStorage.setItem('ez_encryption_key', encryptionKey)
    if (refreshToken) localStorage.setItem('ez_refresh_token', refreshToken)
    localStorage.setItem('ez_google_deviceId', deviceId)   // device fingerprint - used by refreshSocial
    localStorage.setItem('ez_google_email', emailStr)      // shown as "Login email"
    localStorage.setItem('ez_login_method', 'email')
    localStorage.removeItem('ez_email')                    // avoid the PIN-createSession branch (wrong for OTP users)
    localStorage.removeItem('ez_wallet_addr'); localStorage.removeItem('ez_wallet_id')

    const walletData = await initializeWallet(userToken)
    const challengeId = walletData?.data?.challengeId
    if (challengeId) await executeChallenge(await getSDK(), userToken, encryptionKey, challengeId)

    let info = null
    for (let i = 0; i < 3 && !info?.address; i++) {
      info = await getWalletAddress(userToken)
      if (!info?.address) await new Promise(r => setTimeout(r, 2000))
    }
    if (info?.address) localStorage.setItem('ez_wallet_addr', info.address)
    if (info?.walletId) localStorage.setItem('ez_wallet_id', info.walletId)
    saveEmailHistory(emailStr)
    sessionStorage.setItem('ez_pin_ok', '1')   // OTP users have no PIN → skip the PIN gate
    navigate('HomeSend')
  }

  async function handleSubmit() {
    if (!valid || loading) return
    setLoading(true); setError('')

    if (EMAIL_OTP_ENABLED) {
      const em = email.trim()
      try {
        const sdk = await getSDK()
        const deviceId = await sdk.getDeviceId()
        const { otpToken, deviceToken, deviceEncryptionKey } = await createEmailToken(deviceId, em)
        // Set the config + callback, then open Circle's hosted OTP screen.
        sdk.updateConfigs(
          { appSettings: { appId: APP_ID }, loginConfigs: { deviceToken, deviceEncryptionKey, otpToken } },
          async (error, result) => {
            if (error) {
              if (error?.code === 155701) { setLoading(false); return }   // user cancelled → stay silent
              setError(circleErrorMessage(error)); setLoading(false); return
            }
            if (!result?.userToken) { setLoading(false); return }
            try { await finishOtpLogin(result, em, deviceId) }
            catch (e) { setError(circleErrorMessage(e)); setLoading(false) }
          }
        )
        sdk.verifyOtp()   // keep loading=true; the callback above will navigate or raise the error
      } catch (e) {
        setError(circleErrorMessage(e)); setLoading(false)
      }
      return
    }

    // ── Old flow (flag off): direct email + PIN, NO email verification ──
    try {
      localStorage.removeItem('ez_wallet_addr')
      localStorage.removeItem('ez_wallet_id')
      const { userToken, encryptionKey } = await createSession(email.trim())
      localStorage.setItem('ez_user_token', userToken)
      localStorage.setItem('ez_encryption_key', encryptionKey)
      localStorage.setItem('ez_email', email.trim())
      const sdk = await getSDK()
      const walletData = await initializeWallet(userToken)
      const challengeId = walletData?.data?.challengeId
      if (challengeId) await executeChallenge(sdk, userToken, encryptionKey, challengeId)

      const freshSession = await createSession(email.trim())
      const freshToken = freshSession.userToken
      localStorage.setItem('ez_user_token', freshToken)
      localStorage.setItem('ez_encryption_key', freshSession.encryptionKey)

      let walletInfo = null
      for (let i = 0; i < 3; i++) {
        walletInfo = await getWalletAddress(freshToken)
        if (walletInfo?.address) break
        await new Promise(r => setTimeout(r, 2000))
      }
      if (walletInfo?.address) localStorage.setItem('ez_wallet_addr', walletInfo.address)
      if (walletInfo?.walletId) localStorage.setItem('ez_wallet_id', walletInfo.walletId)

      saveEmailHistory(email.trim())
      // First time = the PIN was just CREATED (challengeId present) → already authenticated → straight in. Second time on (no challengeId) → the PIN gate.
      if (challengeId) { sessionStorage.setItem('ez_pin_ok', '1'); navigate('HomeSend') }
      else navigate('PinGate', { next: 'HomeSend' })
    } catch (e) {
      setError(circleErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  // Which chips to show, and where. Figma draws two at y=236 and y=278 - a 42px step - so any further
  // suggestion continues the same step rather than getting its own magic number.
  const chips = suggestions.length > 0
    ? suggestions.map(s => ({ label: s, onClick: () => { setEmail(s); setError('') } }))
    : showDomains
      ? DOMAINS.map(d => ({ label: d, onClick: () => applyDomain(d) }))
      : []

  return (
    // No dark scrim: node 1:193 draws none, and the Login screen behind is BLURRED instead (the user's
    // instruction). This layer only has to sit above that blurred content and catch its own taps.
    <div style={{ position: 'absolute', inset: 0, zIndex: 100 }}>

      {/* The card - node 51:5: 340x414 at (25,86), radius 16, glow shadow 0 0 10px rgba(0,0,0,.5). */}
      <div style={{
        position: 'absolute', left: '6.41%', top: '10.19dvh', width: '87.18%', height: '49.05dvh',
        background: 'var(--color-white)', borderRadius: 16, boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
      }} />

      {/* Title - node 54:4: 24px semibold, line-height 30, centred on (195,121). */}
      <div style={{
        position: 'absolute', left: '50%', top: '14.34dvh', transform: 'translate(-50%, -50%)',
        width: '87.18%', textAlign: 'center',
        fontSize: 24, fontWeight: 'var(--fw-semibold)', lineHeight: '30px', color: 'var(--color-black)',
      }}>
        Log in with email
      </div>

      {/* The email field - node 1:200: 307.96x40 centred at x=195, top edge y=186, radius 8, #D2DCE6,
          with an 18px #94A3B8 placeholder (node 1:202). */}
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="example@gmail.com"
        value={email}
        onChange={e => { setEmail(e.target.value); setError('') }}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        autoFocus
        style={{
          position: 'absolute', left: '50%', top: '22.04dvh', transform: 'translateX(-50%)',
          width: '78.96%', height: 40,
          background: '#D2DCE6', border: 'none', borderRadius: 8,
          // The browser draws a BLACK FOCUS RING on an autofocused input. The design has no such line
          // anywhere, so it read as a drawing mistake rather than as focus. Killed here, not app-wide.
          outline: 'none',
          padding: '0 12px', fontSize: 18, color: 'var(--color-black)',
        }} />

      {chips.map((c, i) => (
        <Chip key={c.label} label={c.label} onClick={c.onClick} top={`${(236 + i * 42) / 844 * 100}dvh`} />
      ))}

      {error && (
        <div style={{
          position: 'absolute', left: '10.51%', right: '10.51%', top: '46.5dvh',
          fontSize: 14, color: 'var(--color-error)',
        }}>
          {error}
        </div>
      )}

      {/* Back / Continue - nodes 1:197 and 1:196: both 48 tall at y=430, RADIUS 16 (not pills), glow
          0 0 8px rgba(0,0,0,.48), labels 18px semibold. Back closes the popup and returns to Login
          rather than navigating anywhere - the popup never was a screen. */}
      <button onClick={onClose}
        style={{
          position: 'absolute', left: '10.54%', top: '50.95dvh', width: '38.43%', height: 48,
          background: 'var(--color-white)', color: 'var(--color-black)', border: 'none', borderRadius: 16,
          boxShadow: '0 0 8px rgba(0, 0, 0, 0.48)',
          fontFamily: 'inherit', fontSize: 18, fontWeight: 'var(--fw-semibold)', cursor: 'pointer',
        }}>
        Back
      </button>
      <button onClick={handleSubmit} disabled={!valid || loading}
        style={{
          position: 'absolute', left: '51.03%', top: '50.95dvh', width: '38.46%', height: 48,
          background: 'var(--color-brand)', color: 'var(--color-white)', border: 'none', borderRadius: 16,
          boxShadow: '0 0 8px rgba(0, 0, 0, 0.48)',
          fontFamily: 'inherit', fontSize: 18, fontWeight: 'var(--fw-semibold)',
          cursor: valid && !loading ? 'pointer' : 'not-allowed',
          opacity: valid && !loading ? 1 : 0.5,
        }}>
        {loading ? 'Processing...' : 'Continue'}
      </button>
    </div>
  )
}
