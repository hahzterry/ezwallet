import arrowDown from '../../design/arrow-down.svg'
import { GRADIENT } from '../brandBg'
import { useNav } from '../nav'
import { useState, useEffect, useRef } from 'react'
import LoginEmailPopup from '../components/LoginEmailPopup'
import { getCookie, setCookie, deleteCookie } from 'cookies-next'
import { createSocialToken, initializeWallet, executeChallenge, getWalletAddress, GOOGLE_CLIENT_ID, circleErrorMessage } from '../circle'

const APP_ID = '4fe094bb23dcbc99b61478055cfa1825:08b512ecd5160aac548249bdfc47dade'

// Translate Circle error codes → a message that names the cause (instead of the baffling
// "Failed to validate..." string). 155140 is almost always a redirect URI missing from the Circle Console
// allowlist or an origin not registered in Google Cloud Console - NOT a code bug (verified against
// SDK 1.1.11 source). The full object is logged so a test on a deploy can read the real code.
function googleErrMsg(error) {
  console.error('[GoogleLogin]', error?.code, error, JSON.stringify(error || {}))
  const code = error?.code
  if (code === 155140) return `Google sign-in was rejected by Circle (code 155140). Almost certainly: origin "${window.location.origin}" is missing from the redirect-URI allowlist in Circle Console and/or Authorized origins in Google Cloud Console (clientId).`
  if (code === 155706) return 'Network error while authenticating with Circle (code 155706). Try again.'
  return circleErrorMessage(error)
}
// Config the SDK needs to rehydrate after the redirect - saved/cleared through COOKIES (they survive the full page reload
// of an OAuth redirect; sessionStorage does NOT → that was the root cause of error 155140, per Circle support).
const COOKIE_KEYS = ['appId', 'google.clientId', 'deviceToken', 'deviceEncryptionKey']

export default function Login() {
  const { navigate } = useNav()
  const sdkRef = useRef(null)
  const [restoring, setRestoring] = useState(false)  // finishing up after the redirect
  const [googleErr, setGoogleErr] = useState('')
  // The email popup (node 1:193). It is NOT a screen - it opens over this one, which blurs behind it.
  const [emailOpen, setEmailOpen] = useState(false)

  // deviceId MUST come from sdk.getDeviceId() (Circle fingerprints it through its own iframe) - do NOT
  // invent one (e.g. crypto.randomUUID()), because Circle's backend knows nothing about a homemade ID → the error
  // "Provided device ID is not found in the system" at performLogin. Exactly per the Circle Web
  // quickstart 3.4: call once, cache in localStorage so it is not requested again on every tap.
  async function ensureDeviceId(sdk) {
    let id = localStorage.getItem('ez_google_deviceId')
    if (id) return id
    id = await sdk.getDeviceId()
    localStorage.setItem('ez_google_deviceId', id)
    return id
  }

  // Initialise the SDK once on mount with the config restored from cookies + the onLoginComplete callback.
  // The first time (empty cookies) → harmless. After a Google redirect (cookies present + a token in the URL hash)
  // → the SDK constructor reads the hash itself and calls onLoginComplete to finish signing in.
  // ⚡ The SDK is lazy-loaded and does NOT block the first paint (2026-07-17). Before: `import { W3SSdk } from '...'` at the top
  // of the file → the Login screen (the FIRST thing a newcomer sees) had to download ~740KB of firebase+crypto before it could
  // even draw the logo. The effect still builds the SDK exactly as before (for the Google redirect flow), but through
  // a dynamic import() running in the BACKGROUND → the logo + buttons appear immediately, the SDK follows.
  useEffect(() => {
    let cancelled = false
    const onLoginComplete = async (error, result) => {
      COOKIE_KEYS.forEach(k => deleteCookie(k))   // the deviceToken is single-use → clean it up right away
      if (error) { setGoogleErr(googleErrMsg(error)); setRestoring(false); return }
      if (!result?.userToken) { setRestoring(false); return }
      try {
        const { userToken, encryptionKey, refreshToken, oAuthInfo } = result
        localStorage.setItem('ez_user_token', userToken)
        localStorage.setItem('ez_encryption_key', encryptionKey)
        // ⚠️ A Circle userToken only lives 60 MINUTES (it is what the PIN challenge uses). Google users have NO
        // ez_email, so the old refreshSession() could NOT refresh it → after 1h every PIN action (Change PIN,
        // sending) returned 403 Forbidden. FIX: SAVE the refreshToken (Circle already returns it) → refreshSession()
        // trades it for a fresh userToken via POST /users/token/refresh. Do NOT throw the refreshToken away again.
        if (refreshToken) localStorage.setItem('ez_refresh_token', refreshToken)
        localStorage.setItem('ez_login_method', 'google')
        // Circle DOES return the Google email in oAuthInfo.socialUserInfo.email - store it SEPARATELY (do NOT write
        // it into ez_email, because ez_email drives the email-login refresh flow = a DIFFERENT identity). It is only for
        // displaying "Login email" instead of "…".
        const gEmail = oAuthInfo?.socialUserInfo?.email
        if (gEmail) localStorage.setItem('ez_google_email', gEmail)
        localStorage.removeItem('ez_wallet_addr')
        localStorage.removeItem('ez_wallet_id')

        // Create the wallet (if there is none) → the challenge to set the first PIN
        const walletData = await initializeWallet(userToken)
        const challengeId = walletData?.data?.challengeId
        if (challengeId) await executeChallenge(sdkRef.current, userToken, encryptionKey, challengeId)

        // The wallet address can be slow to provision → retry a few times
        let info = null
        for (let i = 0; i < 3 && !info?.address; i++) {
          info = await getWalletAddress(userToken)
          if (!info?.address) await new Promise(r => setTimeout(r, 2000))
        }
        if (info?.address) localStorage.setItem('ez_wallet_addr', info.address)
        if (info?.walletId) localStorage.setItem('ez_wallet_id', info.walletId)

        sessionStorage.setItem('ez_pin_ok', '1')   // Google users have no PIN → skip the PIN gate
        navigate('HomeSend')
      } catch (e) {
        setGoogleErr(circleErrorMessage(e)); setRestoring(false)
      }
    }

    // Coming back from the redirect (a token in the URL) → show the "signing in" state IMMEDIATELY,
    // without waiting for the SDK to download.
    const restoringNow = /access_token|id_token|code=/.test(window.location.hash + window.location.search)
    if (restoringNow) setRestoring(true)

    import('@circle-fin/w3s-pw-web-sdk').then(({ W3SSdk }) => {
      if (cancelled) return
      const sdk = new W3SSdk({
        appSettings: { appId: getCookie('appId') || APP_ID },
        loginConfigs: {
          deviceToken: getCookie('deviceToken') || '',
          deviceEncryptionKey: getCookie('deviceEncryptionKey') || '',
          google: {
            clientId: getCookie('google.clientId') || GOOGLE_CLIENT_ID,
            redirectUri: window.location.origin,
            selectAccountPrompt: true,
          },
        },
      }, onLoginComplete)
      sdkRef.current = sdk
      // requested ahead of time so tapping the button is not delayed (not during a restore)
      if (!restoringNow) ensureDeviceId(sdk).catch(() => {})
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  async function handleGoogleLogin() {
    setGoogleErr('')
    try {
      // sdkRef may NOT exist yet if the button is tapped before the dynamic import() finishes (the SDK is lazy since 07-17).
      // The SDK used to be built synchronously in useEffect so it was never null → now it has to be handled.
      // (The Google button is hidden from the UI so this branch does not run today, but do not leave a landmine for when it returns.)
      if (!sdkRef.current) {
        const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
        sdkRef.current = new W3SSdk({ appSettings: { appId: APP_ID } })
      }
      const sdk = sdkRef.current
      const deviceId = await ensureDeviceId(sdk)
      const { deviceToken, deviceEncryptionKey } = await createSocialToken(deviceId)
      // Save the config into COOKIES so the SDK can rehydrate after the redirect (per Circle Web quickstart 3.6)
      setCookie('appId', APP_ID)
      setCookie('google.clientId', GOOGLE_CLIENT_ID)
      setCookie('deviceToken', deviceToken)
      setCookie('deviceEncryptionKey', deviceEncryptionKey)

      sdk.updateConfigs({
        appSettings: { appId: APP_ID },
        loginConfigs: {
          deviceToken, deviceEncryptionKey,
          google: { clientId: GOOGLE_CLIENT_ID, redirectUri: window.location.origin, selectAccountPrompt: true },
        },
      })
      sdk.performLogin('Google')  // = SocialLoginProvider.GOOGLE ('Google')
    } catch (e) {
      setGoogleErr(googleErrMsg(e))
    }
  }

  // ⚠️ Google login is DISABLED (2026-07-03, user decision after session 10). The login itself WORKS
  // (OAuth redirect + SSO wallet creation + PIN all fine), but Circle BLOCKS changing the PIN for SSO users at the
  // platform layer: PUT /user/pin → 403 code 3 despite a fresh token + pinStatus ENABLED (verified by calling the real
  // API). The user decided to turn it off until there is a way forward (either Circle opens it up, or we switch
  // architecture to take the email from Google Identity Services and use the email flow - see HANDOFF session 8).
  // Google login is REMOVED FROM THE UI (user decision 2026-07-05). The plumbing (handleGoogleLogin, cookies,
  // deviceId, refreshToken, onLoginComplete) is KEPT so it can be switched back on quickly - only the button is hidden.

  // LOGIN IS THE LANDING PAGE (user, 2026-09-23: "màn login chính là màn hình landingpage + login email").
  // Figma node 1:180. Every coordinate is that node's own number converted the usual way:
  // x = px/390 as a %, y = px/844 as dvh. Nothing is inherited from the pre-redesign Login.
  return (
    <div className="screen" style={{ background: GRADIENT }}>

      {/* EVERYTHING ON THE LANDING PAGE LIVES IN THIS LAYER so the popup can blur it (the user's rule:
          "khi popup hiện ra thì phần màn hình trang Login sẽ bị mờ đi"). inset:0 means it is exactly the
          screen box, so every child's % / dvh coordinate resolves to the same number as before.
          pointerEvents is cut while the popup is open - there is no dark scrim in the design to swallow
          taps, and a blurred button that still responds is a trap. */}
      <div style={{
        position: 'absolute', inset: 0,
        filter: emailOpen ? 'blur(6px)' : 'none',
        pointerEvents: emailOpen ? 'none' : 'auto',
      }}>

      {/* HEADLINE - node 48:452: bold 40px, line-height 44, tracking -1.6px,
          340 wide at x=25, centred on y=164. The second line is --color-muted-2 (#667085), which is
          what makes the claim read as one sentence with its own echo rather than two shouts.
          ⚠️ NO DISPLAY FACE - AND THE NODE NAMING ONE IS NOT A REASON TO ADD IT BACK. The Figma layer
          declares Bricolage Grotesque; it was wired up on 2026-09-23 and removed the same day:
          "Figma làm fully Inter, vào máy thì sẽ theo hệ thống, bỏ font display cũ đi ko dùng nữa."
          So this inherits the system stack like every other string in the app, and Inter in the Figma
          file stays what it has always been - a stand-in for measuring, never the real render.
          The metrics below ARE the node's own and do stay: 40px / 700 / line-height 44 / tracking -1.6. */}
      <h1 style={{
        position: 'absolute', left: '6.41%', top: '19.43dvh', transform: 'translateY(-50%)',
        width: '87.18%', margin: 0,
        fontSize: 40, fontWeight: 700,
        lineHeight: '44px', letterSpacing: '-1.6px',
        color: 'var(--color-black)',
      }}>
        Six digits.<br />
        <span style={{ color: 'var(--color-muted-2)' }}>That&apos;s the whole wallet.</span>
      </h1>

      {/* THE SIX PIN CELLS - nodes 49:453..49:462 (the 50x70 #D2DCE6 boxes, radius 8, at x = 25, 83,
          141, 199, 257, 315 - an even 58px step, i.e. 50 wide with an 8px gap) and 50:490..50:497 (the
          10px black dots). The dot is drawn INSIDE its cell rather than at its own absolute coordinate:
          Figma puts each dot exactly at the cell's centre, so nesting them is the same geometry with
          six fewer magic numbers. Decorative - this is a picture of a PIN, not an input. */}
      {[6.41, 21.28, 36.15, 51.03, 65.90, 80.77].map((left, i) => (
        <div key={i} aria-hidden="true" style={{
          position: 'absolute', left: `${left}%`, top: '30.57dvh',
          width: '12.82%', height: '8.29dvh',
          background: '#D2DCE6', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-black)' }} />
        </div>
      ))}

      {/* THE LEDE - node 50:471: 20px, line-height 30, 340 wide at x=25, TOP edge at y=364.5 (this one
          is top-anchored in Figma, not centre-anchored like the headline). The opening clause is
          semibold and the rest regular, which is how the node splits its own runs. */}
      <p style={{
        position: 'absolute', left: '6.41%', top: '43.19dvh',
        width: '87.18%', margin: 0,
        fontSize: 20, lineHeight: '30px', color: 'var(--color-black)',
        fontWeight: 'var(--fw-normal)',
      }}>
        <span style={{ fontWeight: 'var(--fw-semibold)' }}>Send and receive digital dollars </span>
        with anyone, using an email and a six-digit PIN. No seed phrase to write down, and no wallet
        address to copy.
      </p>

      {/* The arrow pointing at the button - node 54:2: the same 40x45.94 white arrow the Add screen
          uses, turned -90deg so it points right. Its box is 45.938x40 at (29,703). */}
      <div aria-hidden="true" style={{
        position: 'absolute', left: '7.44%', top: '83.29dvh',
        width: 45.938, height: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <img src={arrowDown} alt="" style={{ width: 40, height: 45.938, transform: 'rotate(-90deg)' }} />
      </div>

      {/* THE ONLY CONTROL - nodes 50:472 (the white pill: 274x70 at x=91, radius 16, and a GLOW rather
          than a drop shadow - Figma's filter is feOffset 0,0 + stdDeviation 5 at 50% black, i.e.
          `0 0 10px rgba(0,0,0,.5)`) and 50:479 (the 24px semibold label centred inside it).
          y 688-758 is row 9 of the guideline grid, where every screen puts its action row.
          ⚠️ This still NAVIGATES to the EnterEmail screen. The user's flow of 2026-09-23 says node
          1:193 "Log in with email" should open as a POPUP over this screen rather than replace it -
          that conversion is its own step and has not been done yet. */}
      <button
        onClick={() => setEmailOpen(true)}
        style={{
          position: 'absolute', left: '23.33%', top: '81.52dvh',
          width: '70.26%', height: '8.29dvh',
          background: 'var(--color-white)', border: 'none', borderRadius: 16,
          boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
          fontSize: 24, fontWeight: 'var(--fw-semibold)', lineHeight: '30px',
          color: 'var(--color-black)', cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}>
        {restoring ? 'Processing...' : 'Log in with email'}
      </button>

      </div>

      {/* The popup carries the whole Circle hand-off: email → createSession → Circle's own PIN screen →
          the wallet. Its three outcomes are the user's own description of the flow (2026-09-23): into
          the wallet, or a brand-new wallet and then into it, or it fails and the user is left here on
          Login. Back just closes it - nothing to navigate away from, because this was never a screen. */}
      {emailOpen && <LoginEmailPopup onClose={() => setEmailOpen(false)} />}

    </div>
  )
}
