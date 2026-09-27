export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { action, userToken, walletId, message } = req.body || {}

  const CIRCLE_BASE = 'https://api.circle.com/v1/w3s'
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
    ...(userToken ? { 'X-User-Token': userToken } : {}),
  }

  try {
    // ── INITIALIZE ──────────────────────────────────────────────────────────
    // Create a wallet for this user. Circle returns a challengeId that the SDK
    // must execute to set the user's first PIN. That challenge is what produces
    // the wallet + walletId.
    if (action === 'initialize') {
      if (!userToken) {
        return res.status(400).json({ error: 'Missing wallet session.' })
      }

      const circleRes = await fetch(`${CIRCLE_BASE}/user/wallets`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          blockchains: ['ARC-TESTNET'], // or ['ARC'] for mainnet
          accountType: 'SCA',
        }),
      })
      const data = await circleRes.json()
      if (!circleRes.ok) {
        console.error('[api/wallet initialize]', data)
        return res.status(circleRes.status).json({
          error: data?.message || 'Unable to initialize wallet.',
          detail: data,
        })
      }

      // Flatten so the frontend reads { challengeId } directly
      return res.json(data.data || data)
    }

    // ── GET ADDRESS ─────────────────────────────────────────────────────────
    // Fetch the user's wallet (address + walletId). Called AFTER the challenge
    // has been executed (i.e. the PIN is set).
    if (action === 'getAddress') {
      if (!userToken) {
        return res.status(400).json({ error: 'Missing wallet session.' })
      }

      const circleRes = await fetch(`${CIRCLE_BASE}/wallets`, {
        method: 'GET',
        headers,
      })
      const data = await circleRes.json()
      if (!circleRes.ok) {
        console.error('[api/wallet getAddress]', data)
        return res.status(circleRes.status).json({
          error: data?.message || 'Unable to fetch wallet.',
        })
      }

      const wallet = data?.data?.wallets?.[0]
      if (!wallet) return res.json({})

      return res.json({
        walletId: wallet.id,
        address: wallet.address,
        blockchain: wallet.blockchain,
      })
    }

    // ── SIGN MESSAGE ────────────────────────────────────────────────────────
    // Creates a signing challenge. The SDK opens the PIN screen when it executes.
    if (action === 'signMessage') {
      if (!userToken || !walletId) {
        return res.status(400).json({ error: 'Missing wallet session.' })
      }

      const circleRes = await fetch(`${CIRCLE_BASE}/user/sign/message`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          walletId,
          message: message || 'Unlock Monyuny',
        }),
      })
      const data = await circleRes.json()
      if (!circleRes.ok) {
        console.error('[api/wallet signMessage]', data)
        return res.status(circleRes.status).json({
          error: data?.message || 'Unable to create signing challenge.',
          detail: data,
        })
      }

      return res.json({ challengeId: data?.data?.challengeId })
    }

    // ── RESET PIN ───────────────────────────────────────────────────────────
    if (action === 'resetPin') {
      if (!userToken) {
        return res.status(400).json({ error: 'Missing wallet session.' })
      }

      const circleRes = await fetch(`${CIRCLE_BASE}/user/pin`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      })
      const data = await circleRes.json()
      if (!circleRes.ok) {
        console.error('[api/wallet resetPin]', data)
        return res.status(circleRes.status).json({
          error: data?.message || 'Unable to reset PIN.',
        })
      }

      return res.json({ challengeId: data?.data?.challengeId })
    }

    // ── RESTORE PIN ─────────────────────────────────────────────────────────
    if (action === 'restorePin') {
      if (!userToken) {
        return res.status(400).json({ error: 'Missing wallet session.' })
      }

      const circleRes = await fetch(`${CIRCLE_BASE}/user/pin/restore`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      })
      const data = await circleRes.json()
      if (!circleRes.ok) {
        console.error('[api/wallet restorePin]', data)
        return res.status(circleRes.status).json({
          error: data?.message || 'Unable to restore PIN.',
        })
      }

      return res.json({ challengeId: data?.data?.challengeId })
    }

    return res.status(400).json({ error: 'Unknown action.' })
  } catch (error) {
    console.error('[api/wallet]', error)
    return res.status(500).json({ error: error.message })
  }
}