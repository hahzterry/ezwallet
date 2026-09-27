import { useState, useEffect, useRef } from 'react'
import { useNav } from '../nav'
import { refreshSession, forceFreshSession, isTokenExpiredError, getSDK, executeChallenge, signMessageChallenge, circleErrorMessage } from '../circle'
import logoLong from '../../design/logo.png'

// WALLET UNLOCK using the Circle PIN itself. Entering the screen opens Circle's PIN iframe IMMEDIATELY - there is
// NO separate project-made "Enter your PIN" screen (user decision 2026-07-15: drop the project PIN screen, tapping
// sign-in shows only Circle's PIN). While it opens, only the logo shows (clean background). A CANCEL/error reveals the retry button.
export default function PinGate() {
  const { navigate, params } = useNav()
  const next = params?.next || 'HomeSend'
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)   // busy by default = opening the Circle PIN → no project UI yet
  const tried = useRef(false)

  // One unlock round: get a token → create a challenge signing an empty message → open the Circle PIN. forceFresh=true =
  // FORCE minting a new token (used when the previous round hit 155104 "token expired").
  async function attemptUnlock(forceFresh) {
    const { userToken, encryptionKey } = forceFresh ? await forceFreshSession() : await refreshSession()
    const walletId = localStorage.getItem('ez_wallet_id')
    // Ask for the nonce BEFORE signing: this single PIN round both unlocks the app and opens the contacts backup session
    // (PIN-signature auth - see functions/api/sync.js). The user NEVER has to enter the PIN a second time.
    // No nonce (KV not enabled / slow network / error) → sign the default sentence, the app opens as usual.
    const sync = await import('../sync')
      .then(async s => ({ s, m: await s.prepareUnlockMessage() }))
      .catch(() => null)
    const challengeId = await signMessageChallenge(userToken, walletId, sync?.m?.message)
    const sdk = await getSDK()
    // Circle's own "Forgot PIN" button lives INSIDE its PIN iframe (EnterPincode screen) - it does nothing unless
    // a callback is registered (Circle's docs warn: unregistered, the click has no effect). true = close Circle's
    // modal first so ours (ForgotPin.jsx) isn't fighting a leftover iframe on top of it.
    if (sdk.setOnForgotPin) sdk.setOnForgotPin(() => navigate('ForgotPin', { next }), true)
    const result = await executeChallenge(sdk, userToken, encryptionKey, challengeId)
    sessionStorage.setItem('ez_pin_ok', '1')
    // Backup is a SIDE feature: trading the signature for a token and pulling the copy back both run in the
    // BACKGROUND, not awaited and swallowing every error - a contact list must never hold the user at the front door.
    const signature = result?.data?.signature
    if (sync?.m && signature) {
      sync.s.openSession(sync.m.nonce, signature)
        .then(ok => { if (ok) return sync.s.pullOnce() })
        .catch(() => {})
    }
    navigate(next)
  }

  async function unlock() {
    setBusy(true); setError('')
    try {
      await attemptUnlock(false)
    } catch (e) {
      if (e?.code === 155701) { setBusy(false); return }   // user cancelled the PIN themselves → show the retry button
      // Session token expired/invalid (155104…): refreshSession may have silently handed back the old token.
      // Mint a NEW token and retry once - exactly what the Circle docs recommend. Still broken (e.g. missing
      // session state) → back to a CLEAN Login; signing in again always works (this is why "sign out and back in fixes it").
      if (isTokenExpiredError(e)) {
        try {
          await attemptUnlock(true)
        } catch (e2) {
          if (e2?.code === 155701) { setBusy(false); return }
          if (isTokenExpiredError(e2) || e2?.message === 'no-session') { signOut(); return }
          setError(circleErrorMessage(e2)); setBusy(false)
        }
        return
      }
      setError(circleErrorMessage(e))
      setBusy(false)
    }
  }

  // Open Circle's PIN screen as soon as we arrive (like a banking app).
  useEffect(() => { if (!tried.current) { tried.current = true; unlock() } }, [])

  function signOut() {
    ;['ez_user_token', 'ez_wallet_addr', 'ez_wallet_id', 'ez_encryption_key', 'ez_email', 'ez_refresh_token', 'ez_google_email', 'ez_login_method'].forEach(k => localStorage.removeItem(k))
    sessionStorage.removeItem('ez_pin_ok')
    sessionStorage.removeItem('ez_sync_token')
    navigate('Login')
  }

  // Circle PIN opening → show only the logo (clean background), Circle's PIN iframe floats above it.
  // ⚠️ THIS is the logo screen a returning user actually sees on every visit (ez_pin_ok lives in
  // sessionStorage, so App.jsx boots straight here, skipping Splash entirely) - it MUST use the shared
  // `.logo-lockup`, not a lockup of its own. See THE LOGO RULE in index.css.
  if (busy) {
    return (
      <div className="screen">
        <img className="logo-lockup" src={logoLong} alt="ezwallet" />
      </div>
    )
  }

  // The user cancelled / hit an error → let them retry (only now do the UI + button appear).
  // The error line sits at 34.72dvh - the same slot Login puts its slogan in, directly under the lockup.
  return (
    <div className="screen">
      <img className="logo-lockup" src={logoLong} alt="ezwallet" />
      {error && (
        <div style={{ position: 'absolute', top: '34.72dvh', left: '6.41%', right: '6.41%', fontSize: 'var(--fs-content-1)', color: 'var(--color-error)', textAlign: 'center' }}>{error}</div>
      )}
      <div className="row-10 row10-dual">
        <button className="btn btn-secondary" onClick={signOut}>Sign out</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={unlock}>Unlock</button>
      </div>
    </div>
  )
}
