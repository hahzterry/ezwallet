```javascript
import crypto from 'crypto'
import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets'

// ─────────────────────────────────────────────────────────────
// CIRCLE CONFIG
// ─────────────────────────────────────────────────────────────

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY

if (!CIRCLE_API_KEY) {
  console.error('[Circle] CIRCLE_API_KEY is missing')
}

// Initialize the SDK for future Circle SDK operations.
const circle = CIRCLE_API_KEY
  ? initiateUserControlledWalletsClient({
      apiKey: CIRCLE_API_KEY,
    })
  : null

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function getDeviceId(email, deviceId) {
  if (deviceId && typeof deviceId === 'string' && deviceId.trim()) {
    return deviceId.trim()
  }

  return `mon-${Buffer.from(email.trim().toLowerCase())
    .toString('hex')
    .slice(0, 32)}`
}

async function circleRequest(endpoint, body) {
  if (!CIRCLE_API_KEY) {
    throw new Error(
      'CIRCLE_API_KEY is not configured. Add it to the Vercel environment variables and redeploy.'
    )
  }

  const response = await fetch(`https://api.circle.com${endpoint}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CIRCLE_API_KEY}`,
    },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      ...body,
    }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    console.error('[Circle API Error]', {
      endpoint,
      status: response.status,
      message: data?.message,
      code: data?.code,
    })

    const error = new Error(
      data?.message || `Circle API request failed with ${response.status}`
    )

    error.status = response.status
    error.circleData = data

    throw error
  }

  return data?.data || data
}

// ─────────────────────────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // ───────────────────────────────────────────────────────────
  // GET: session status
  // ───────────────────────────────────────────────────────────

  if (req.method === 'GET') {
    return res.status(200).json({
      authenticated: false,
    })
  }

  // ───────────────────────────────────────────────────────────
  // POST ONLY
  // ───────────────────────────────────────────────────────────

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
    })
  }

  const {
    action,
    email,
    credential,
    deviceId,
    refreshToken,
  } = req.body || {}

  try {
    // ─────────────────────────────────────────────────────────
    // EMAIL LOGIN
    // POST /v1/w3s/users/email/token
    // ─────────────────────────────────────────────────────────

    if (action === 'session' || (!action && email)) {
      if (!email || typeof email !== 'string') {
        return res.status(400).json({
          error: 'Email is required.',
        })
      }

      const normalizedEmail = email.trim().toLowerCase()

      if (!normalizedEmail.includes('@')) {
        return res.status(400).json({
          error: 'A valid email address is required.',
        })
      }

      const effectiveDeviceId = getDeviceId(
        normalizedEmail,
        deviceId
      )

      const data = await circleRequest(
        '/v1/w3s/users/email/token',
        {
          email: normalizedEmail,
          deviceId: effectiveDeviceId,
        }
      )

      return res.status(200).json(data)
    }

    // ─────────────────────────────────────────────────────────
    // EMAIL TOKEN
    // Used before Circle SDK verifyOtp()
    // ─────────────────────────────────────────────────────────

    if (action === 'emailToken') {
      if (!email || typeof email !== 'string') {
        return res.status(400).json({
          error: 'Email is required.',
        })
      }

      if (!deviceId || typeof deviceId !== 'string') {
        return res.status(400).json({
          error: 'deviceId is required.',
        })
      }

      const data = await circleRequest(
        '/v1/w3s/users/email/token',
        {
          email: email.trim().toLowerCase(),
          deviceId: deviceId.trim(),
        }
      )

      return res.status(200).json(data)
    }

    // ─────────────────────────────────────────────────────────
    // GOOGLE LOGIN
    // ─────────────────────────────────────────────────────────

    if (action === 'google') {
      console.warn(
        '[api/session google] Google login is not enabled server-side.'
      )

      return res.status(501).json({
        error: 'Google login is not yet enabled on the server.',
      })
    }

    // ─────────────────────────────────────────────────────────
    // SOCIAL TOKEN
    // ─────────────────────────────────────────────────────────

    if (action === 'socialToken') {
      if (!deviceId || typeof deviceId !== 'string') {
        return res.status(400).json({
          error: 'deviceId is required.',
        })
      }

      const data = await circleRequest(
        '/v1/w3s/users/social/token',
        {
          deviceId: deviceId.trim(),
        }
      )

      return res.status(200).json(data)
    }

    // ─────────────────────────────────────────────────────────
    // REFRESH SOCIAL TOKEN
    // ─────────────────────────────────────────────────────────

    if (action === 'refreshSocial') {
      if (!refreshToken || typeof refreshToken !== 'string') {
        return res.status(400).json({
          error: 'refreshToken is required.',
        })
      }

      if (!deviceId || typeof deviceId !== 'string') {
        return res.status(400).json({
          error: 'deviceId is required.',
        })
      }

      const data = await circleRequest(
        '/v1/w3s/users/token/refresh',
        {
          refreshToken: refreshToken.trim(),
          deviceId: deviceId.trim(),
        }
      )

      return res.status(200).json(data)
    }

    // ─────────────────────────────────────────────────────────
    // LOGOUT
    // ─────────────────────────────────────────────────────────

    if (action === 'logout') {
      return res.status(200).json({
        ok: true,
      })
    }

    return res.status(400).json({
      error: 'Unknown action.',
    })
  } catch (error) {
    console.error('[api/session]', {
      message: error?.message,
      status: error?.status,
      circleCode: error?.circleData?.code,
    })

    // ─────────────────────────────────────────────────────────
    // CIRCLE AUTH ERROR
    // ─────────────────────────────────────────────────────────

    if (error?.status === 401) {
      return res.status(401).json({
        error: 'Circle API authentication failed.',
        detail:
          error?.circleData?.message ||
          'The CIRCLE_API_KEY is invalid, expired, or belongs to the wrong environment.',
      })
    }

    // ─────────────────────────────────────────────────────────
    // OTHER CIRCLE ERROR
    // ─────────────────────────────────────────────────────────

    if (error?.status) {
      return res.status(error.status).json({
        error: error.message,
        detail: error?.circleData,
      })
    }

    // ─────────────────────────────────────────────────────────
    // SERVER ERROR
    // ─────────────────────────────────────────────────────────

    return res.status(500).json({
      error: error?.message || 'Internal server error.',
    })
  }
}