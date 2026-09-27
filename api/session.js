import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets'

// The SDK client is initialized but not used directly in this handler yet —
// kept here so future branches (e.g. server-side wallet lookups) can use it
// without re-importing. Circle's REST API is called via fetch() below.
const circle = initiateUserControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
})

export default async function handler(req, res) {
  // ── GET: session status ────────────────────────────────────────────────────
  if (req.method === 'GET') {
    return res.json({ authenticated: false })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { action, email, credential, deviceId } = req.body || {}

  try {
    // ── EMAIL LOGIN ─────────────────────────────────────────────────────────
    // ⚠️ Email login is a TWO-STEP flow in Circle:
    //   1. Ask Circle to email a one-time code → returns deviceToken +
    //      deviceEncryptionKey + otpToken. NO userToken yet.
    //   2. The user enters the code in the Circle SDK iframe, which calls
    //      verifyOtp() and only THEN yields a userToken + encryptionKey.
    //
    // ⚠️ Circle expects the field name `email`, NOT `userId`, and requires
    //    `deviceId` to be a non-empty string.
    if (action === 'session' || (!action && email)) {
      if (!email) {
        return res.status(400).json({ error: 'Email is required.' })
      }

      // Stable fallback deviceId if the frontend did not supply one.
      const effectiveDeviceId =
        deviceId || `mon-${Buffer.from(email).toString('hex').slice(0, 32)}`

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
            email,
            deviceId: effectiveDeviceId,
          }),
        }
      )
      const data = await circleRes.json()

      if (!circleRes.ok) {
        console.error('[api/session email]', data)
        return res.status(circleRes.status).json({
          error: data?.message || 'Unable to start email login.',
          detail: data,
        })
      }

      // Circle returns: { data: { deviceToken, deviceEncryptionKey, otpToken } }
      // Flatten it so the frontend can read it directly.
      return res.json(data.data || data)
    }

    // ── EMAIL TOKEN (for SDK verifyOtp) ────────────────────────────────────
    // Re-issues a fresh otpToken + deviceToken for the SDK's verifyOtp().
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
            email,
            deviceId,
          }),
        }
      )
      const data = await circleRes.json()

      if (!circleRes.ok) {
        console.error('[api/session emailToken]', data)
        return res.status(circleRes.status).json({
          error: data?.message || 'Unable to issue email token.',
          detail: data,
        })
      }

      return res.json(data.data || data)
    }

    // ── GOOGLE LOGIN ────────────────────────────────────────────────────────
    // ⚠️ NOT WIRED. Google login requires server-side verification of the
    // ID token (signature, iss, aud, exp, email_verified). Until that exists,
    // return 501 so a forged token can never "sign in".
    if (action === 'google') {
      console.warn('[api/session google] Google login not yet verified server-side.')
      return res.status(501).json({
        error: 'Google login is not yet enabled on the server.',
      })
    }

    // ── SOCIAL TOKEN (Circle SDK handoff) ───────────────────────────────────
    // Used by createSocialToken() in circle.js for the Google SDK redirect flow.
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
          detail: data,
        })
      }

      return res.json(data.data || data)
    }

    // ── REFRESH SOCIAL TOKEN ────────────────────────────────────────────────
    // Trade the refreshToken for a fresh userToken (used by Google users).
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
          detail: data,
        })
      }

      return res.json(data.data || data)
    }

    // ── LOGOUT ──────────────────────────────────────────────────────────────
    if (action === 'logout') {
      return res.json({ ok: true })
    }

    return res.status(400).json({ error: 'Unknown action.' })
  } catch (error) {
    console.error('[api/session]', error)
    return res.status(500).json({ error: error.message })
  }
}