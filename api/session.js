import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets'

const circle = createClient(process.env.CIRCLE_API_KEY)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Session status
    return res.json({ authenticated: false })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { action, email, credential, deviceId } = req.body

  try {
    if (action === 'session') {
      // Email login flow
      const response = await fetch('https://api.circle.com/v1/w3s/users/social/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
        },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), email })
      })
      const data = await response.json()
      return res.json(data)
    }

    if (action === 'google') {
      // Google login flow - verify token first, then create Circle session
      // ⚠️ You must verify the Google credential here (signature, aud, iss, exp, email_verified)
      const response = await fetch('https://api.circle.com/v1/w3s/users/social/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
        },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), deviceId })
      })
      const data = await response.json()
      return res.json(data)
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (error) {
    console.error('[api/session]', error)
    return res.status(500).json({ error: error.message })
  }
}