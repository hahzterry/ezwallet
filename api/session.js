import crypto from 'crypto'

// ─────────────────────────────────────────────────────────────
// CIRCLE CONFIG
// ─────────────────────────────────────────────────────────────

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY

// Do NOT initialize the Circle SDK here.
// This endpoint uses Circle's REST API directly.

// ─────────────────────────────────────────────────────────────
// CIRCLE REST REQUEST
// ─────────────────────────────────────────────────────────────

async function circleRequest(endpoint, body) {
  if (!CIRCLE_API_KEY) {
    const error = new Error('CIRCLE_API_KEY is missing from Vercel.')
    error.status = 500
    throw error
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
    const error = new Error(
      data?.message ||
        `Circle API request failed with status ${response.status}`
    )

    error.status = response.status
    error.circleData = data

    throw error
  }

  return data?.data || data
}

// ─────────────────────────────────────────────────────────────
// API HANDLER
// ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // ───────────────────────────────────────────────────────────
  // GET
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
    deviceId,
    refreshToken,
  } = req.body || {}

  try {
    // ─────────────────────────────────────────────────────────
    // EMAIL LOGIN
    // ─────────────────────────────────────────────────────────

    if (action === 'session' || (!action && email)) {
      if (!email || typeof email !== 'string') {
        return res.status(400).json({
          error: 'Email is required.',
        })
      }

      if (!deviceId || typeof deviceId !== 'string') {
        return res.status(400).json({
          error:
            'deviceId is required. The frontend must provide the Circle SDK deviceId.',
        })
      }

      const normalizedEmail = email.trim().toLowerCase()
      const normalizedDeviceId = deviceId.trim()

      if (!normalizedEmail.includes('@')) {
        return res.status(400).json({
          error: 'A valid email address is required.',
        })
      }

      if (!normalizedDeviceId) {
        return res.status(400).json({
          error: 'deviceId cannot be empty.',
        })
      }

      const data = await circleRequest(
        '/v1/w3s/users/email/token',
        {
          email: normalizedEmail,
          deviceId: normalizedDeviceId,
        }
      )

      return res.status(200).json(data)
    }

    // ─────────────────────────────────────────────────────────
    // EMAIL TOKEN
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
    // GOOGLE / SOCIAL LOGIN
    // ─────────────────────────────────────────────────────────

    if (action === 'google') {
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
      circleMessage: error?.circleData?.message,
    })

    // Circle authentication failure
    if (error?.status === 401) {
      return res.status(401).json({
        error: 'Circle API authentication failed.',
        detail:
          error?.circleData?.message ||
          'CIRCLE_API_KEY is invalid or belongs to the wrong Circle environment.',
      })
    }

    // Missing API key
    if (
      error?.message ===
      'CIRCLE_API_KEY is missing from Vercel.'
    ) {
      return res.status(500).json({
        error: 'Circle is not configured.',
        detail:
          'CIRCLE_API_KEY is missing from the server environment.',
      })
    }

    // Other Circle error
    if (error?.status) {
      return res.status(error.status).json({
        error: error.message,
        detail: error?.circleData || null,
      })
    }

    // Unexpected server error
    return res.status(500).json({
      error: error?.message || 'Internal server error.',
    })
  }
}