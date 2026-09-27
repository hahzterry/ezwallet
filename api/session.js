import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets'

const circle = initiateUserControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
})

export default async function handler(req, res) {
  // ── GET: session status ────────────────────────────────────────────────────
  // Used by getSession() in circle.js for app-startup checks. We do not yet
  // persist server-side sessions (the frontend uses localStorage tokens), so
  // this can only report "not authenticated". Replace with a real session store
  // (e.g. httpOnly cookie + a DB row) when you move tokens off the browser.
  if (req.method === 'GET') {
    return res.json({ authenticated: false })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { action, email, credential, deviceId } = req.body || {}

  try {
    // ── EMAIL LOGIN ─────────────────────────────────────────────────────────
    // Frontend (circle.js → createSession) sends only { email }.
    // Accept it both as a bare body and as { action: 'session', email }.
    //
    // ⚠️ Email login is a TWO-STEP flow in Circle:
    //   1. Ask Circle to email a one-time code → returns deviceToken +
    //      deviceEncryptionKey + otpToken. NO userToken yet.
    //   2. The user enters the code in the Circle SDK iframe, which calls
    //      verifyOtp() and only THEN yields a userToken + encryptionKey.
    //
    // So this endpoint cannot return a `userToken` by itself. The frontend
    // must call sdk.verifyOtp({ otpToken, ... }) after this response.
    if (action === 'session' || (!action && email)) {
      if (!email) {
        return res.status(400).json({ error: 'Email is required.' })
      }

      const circleRes = await fetch(
        'https://api.circle.com/v1/w3s/users/email/token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
          },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            userId: email,
          }),
        }
      )
      const data = await circleRes.json()

      if (!circleRes.ok) {
        console.error('[api/session email]', data)
        return res.status(circleRes.status).json({
          error: data?.message || 'Unable to start email login.',
        })
      }

      // Circle returns: { data: { deviceToken, deviceEncryptionKey, otpToken } }
      // Flatten it so the frontend can read it directly.
      return res.json(data.data || data)
    }

    // ── EMAIL TOKEN (for SDK verifyOtp) ────────────────────────────────────
    // The SDK's verifyOtp() needs the deviceToken + otpToken from the step
    // above, plus the code the user typed. This endpoint is a convenience
    // re-issue if the frontend needs a fresh otpToken.
    if (action === 'emailToken') {
      if (!email || !deviceId) {
        return res.status(400).json({ error: 'Email and deviceId are required.' })
      }

      const circleRes = await fetch(
        'https://api.circle.com/v1/w3s/users/email/token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
          },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            userId: email,
            deviceId,
          }),
        }
      )
      const data = await circleRes.json()

      if (!circleRes.ok) {
        console.error('[api/session emailToken]', data)
        return res.status(circleRes.status).json({
          error: data?.message || 'Unable to issue email token.',
        })
      }

      return res.json(data.data || data)
    }

    // ── GOOGLE LOGIN ────────────────────────────────────────────────────────
    // ⚠️ NOT WIRED. Before this can work, you MUST verify the Google ID token
    // (`credential`) server-side:
    //   - signature (fetch Google's JWKS)
    //   - iss === 'https://accounts.google.com'
    //   - aud === your GOOGLE_CLIENT_ID
    //   - exp is in the future
    //   - email_verified === true
    // Only then should you look up / create a Circle user for that email.
    //
    // Until that verification exists, this branch returns 501 so it is
    // impossible to accidentally "sign in" with a forged token.
    if (action === 'google') {
      console.warn('[api/session google] Google login not yet verified server-side.')
      return res.status(501).json({
        error: 'Google login is not yet enabled on the server.',
      })
    }

    // ── SOCIAL TOKEN (Circle SDK handoff) ───────────────────────────────────
    // Used by createSocialToken() in circle.js for the Google SDK redirect flow.
    // Circle expects the deviceId here, not an email.
    if (action === 'socialToken') {
      if (!deviceId) {
        return res.status(400).json({ error: 'deviceId is required.' })
      }

      const circleRes = await fetch(
        'https://api.circle.com/v1/w3s/users/social/token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
          },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            deviceId,
          }),
        }
      )
      const data = await circleRes.json()

      if (!circleRes.ok) {
        console.error('[api/session socialToken]', data)
        return res.status(circleRes.status).json({
          error: data?.message || 'Unable to start social login.',
        })
      }

      return res.json(data.data || data)
    }

    // ── REFRESH SOCIAL TOKEN ────────────────────────────────────────────────
    // Trade the refreshToken (returned by Circle at social login) for a fresh
    // userToken. Used by Google users, who have no userId=email to mint with.
    if (action === 'refreshSocial') {
      const { refreshToken: rt } = req.body || {}
      if (!rt || !deviceId) {
        return res.status(400).json({ error: 'refreshToken and deviceId are required.' })
      }

      const circleRes = await fetch(
        'https://api.circle.com/v1/w3s/users/token/refresh',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
          },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            refreshToken: rt,
            deviceId,
          }),
        }
      )
      const data = await circleRes.json()

      if (!circleRes.ok) {
        console.error('[api/session refreshSocial]', data)
        return res.status(circleRes.status).json({
          error: data?.message || 'Unable to refresh session.',
        })
      }

      return res.json(data.data || data)
    }

    // ── LOGOUT ──────────────────────────────────────────────────────────────
    // The frontend clears its own localStorage; there is no server session yet.
    // This branch exists so circle.js's logout() does not 400.
    if (action === 'logout') {
      return res.json({ ok: true })
    }

    return res.status(400).json({ error: 'Unknown action.' })
  } catch (error) {
    console.error('[api/session]', error)
    return res.status(500).json({ error: error.message })
  }
}