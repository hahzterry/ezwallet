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
    // Returns the SAME nested shape Circle does: { data: { challengeId } }
    // so the frontend's `walletData?.data?.challengeId` reads it correctly.
    if (action === 'initialize') {
      if (!userToken) {
        return res.status(400).json({ error: 'Missing wallet session.' })
      }

      const circleRes = await fetch(`${CIRCLE_BASE}/user/wallets`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          blockchains: ['ARC-TESTNET'], // change to ['ARC'] when going mainnet
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

      // ⚠️ Return the NESTED shape, not flattened.
      return res.json(data)
    }

    // ── GET ADDRESS ─────────────────────────────────────────────────────────
    // Also returns the NESTED shape: { data: { wallets: [...] } }, matching
    // Circle's own response. The frontend unwraps it via `info?.address`.
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
      if (!wallet) return res.json({ data: { wallets: [] } })

      // Nest it so the frontend's getWalletAddress() can unwrap it the same way.
      return res.json({
        data: {
          wallets: [{
            id: wallet.id,
            address: wallet.address,
            blockchain: wallet.blockchain,
          }],
        },
      })
    }

    // ── SIGN MESSAGE ────────────────────────────────────────────────────────
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

      return res.json({ data: { challengeId: data?.data?.challengeId } })
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

      return res.json({ data: { challengeId: data?.data?.challengeId } })
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

      return res.json({ data: { challengeId: data?.data?.challengeId } })
    }

    return res.status(400).json({ error: 'Unknown action.' })
  } catch (error) {
    console.error('[api/wallet]', error)
    return res.status(500).json({ error: error.message })
  }
}