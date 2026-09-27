// Tests for /api/sync (backing contacts + the QR library up to KV) - calling the handler DIRECTLY, with a fake KV.
// Why it has to be tested this way: the sync flow needs a real Circle PIN signature, and the Circle SDK does not run on
// localhost → it cannot be exercised through the app on this machine. Here it is signed with a viem private key: the same EIP-191
// standard Circle uses, so the server verification under test is EXACTLY what runs in production.
//
// The invariants locked down here:
//  · identity = THE ADDRESS RECOVERED FROM THE SIGNATURE (never trust the client, never ask Circle, no email needed)
//  · a nonce is SINGLE USE (replay blocked)
//  · knowing an email no longer opens the address book - the server does not call Circle any more
//  · avatars NEVER reach the server
//  · with no KV binding it returns 503 and the app behaves as before
//  · data backed up by the OLD version (key `bak:<addr>`) still reads back
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { privateKeyToAccount } from 'viem/accounts'
import { onRequestPost } from '../functions/api/sync.js'

// 2 fixed test wallets (private keys that appear publicly in every viem/hardhat example - not secrets).
const me = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const attacker = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba')
const OTHER = '0x1111111111111111111111111111111111111111'

function fakeKV(initial = {}) {
  const m = new Map(Object.entries(initial).map(([k, v]) => [k, { v, exp: 0 }]))
  return {
    store: m,
    get: async k => {
      const rec = m.get(k)
      if (!rec) return null
      if (rec.exp && Date.now() > rec.exp) { m.delete(k); return null }
      return rec.v
    },
    put: async (k, v, opts) => void m.set(k, { v, exp: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : 0 }),
    delete: async k => void m.delete(k),
  }
}

const call = (env, body) => onRequestPost({ env, request: new Request('http://x/api/sync', { method: 'POST', body: JSON.stringify(body) }) })

// Opening a session properly: request a nonce → sign → trade it for a token. This is the real PinGate flow.
async function openSession(env, account = me) {
  const { nonce, message } = await (await call(env, { action: 'nonce' })).json()
  const signature = await account.signMessage({ message })
  const res = await call(env, { action: 'session', nonce, signature })
  return { res, token: (await res.clone().json()).token, nonce, signature, message }
}

const envWithKV = (initial) => ({ EZ_SYNC: fakeKV(initial) })

test('no KV binding yet → 503 sync-disabled (the app must behave as before)', async () => {
  const res = await call({}, { action: 'nonce' })
  assert.equal(res.status, 503)
  assert.equal((await res.json()).error, 'sync-disabled')
})

test('nonce → session: the KV key is the address RECOVERED FROM THE SIGNATURE', async () => {
  const env = envWithKV()
  const { token } = await openSession(env)
  assert.ok(token)

  await call(env, { action: 'push', token, payload: { updatedAt: 1234, contacts: [{ id: 1, name: 'Grandma', address: OTHER }] } })
  assert.ok(env.EZ_SYNC.store.has(`bak:${me.address.toLowerCase()}`), 'the key must be the address of the wallet that signed')

  const got = (await (await call(env, { action: 'pull', token })).json()).data
  assert.equal(got.updatedAt, 1234)
  assert.deepEqual(got.contacts, [{ id: 1, name: 'Grandma', address: OTHER }])
})

test('session also returns the address so the client can compare it with the open wallet', async () => {
  const env = envWithKV()
  const { res } = await openSession(env)
  const body = await res.json()
  assert.equal(body.address, me.address.toLowerCase())
})

test('REPLAY: a spent nonce CANNOT be reused', async () => {
  const env = envWithKV()
  const { nonce, signature } = await openSession(env)
  const again = await call(env, { action: 'session', nonce, signature })
  assert.equal(again.status, 401)
  assert.equal((await again.json()).error, 'bad-nonce')
})

test('a made-up nonce → 401, no token issued', async () => {
  const env = envWithKV()
  const message = 'Unlock Monyuny. Nonce: 00000000-0000-0000-0000-000000000000'
  const signature = await me.signMessage({ message })
  const res = await call(env, { action: 'session', nonce: '00000000-0000-0000-0000-000000000000', signature })
  assert.equal(res.status, 401)
})

test('a garbage signature → 401 bad-signature (does not blow up with a 500)', async () => {
  const env = envWithKV()
  const { nonce } = await (await call(env, { action: 'nonce' })).json()
  const res = await call(env, { action: 'session', nonce, signature: '0xdeadbeef' })
  assert.equal(res.status, 401)
  assert.equal((await res.json()).error, 'bad-signature')
})

test('SOMEONE ELSE signing validly still CANNOT read your book (each signature opens only its own)', async () => {
  const env = envWithKV()
  const mine = await openSession(env)
  await call(env, { action: 'push', token: mine.token, payload: { updatedAt: 9, contacts: [{ id: 1, name: 'Mum', address: OTHER }] } })

  const theirs = await openSession(env, attacker)
  const got = (await (await call(env, { action: 'pull', token: theirs.token })).json()).data
  assert.equal(got, null, 'the other wallet must see an EMPTY book, never someone else\'s contacts')
})

test('KNOWING THE EMAIL IS NO LONGER A WAY IN - the server does not call Circle any more', async () => {
  // The 07-29 technical debt: the old door was a userToken, and a userToken could be obtained knowing only the email.
  // The new version must not touch Circle on the sync path at all → any outbound fetch is a regression.
  const orig = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('sync must NOT make outbound network calls any more') }
  try {
    const env = envWithKV()
    const { token } = await openSession(env)
    const res = await call(env, { action: 'pull', token })
    assert.equal(res.status, 200)
  } finally {
    globalThis.fetch = orig
  }
})

test('missing token → 400; wrong/expired token → 401, and NOTHING is written', async () => {
  const env = envWithKV()
  assert.equal((await call(env, { action: 'pull' })).status, 400)
  const res = await call(env, { action: 'push', token: 'not-a-token', payload: { contacts: [] } })
  assert.equal(res.status, 401)
  assert.equal([...env.EZ_SYNC.store.keys()].filter(k => k.startsWith('bak:')).length, 0)
})

test('AVATARS + unknown fields are stripped - photos of real people NEVER reach the server', async () => {
  const env = envWithKV()
  const { token } = await openSession(env)
  await call(env, {
    action: 'push', token,
    payload: { contacts: [{ id: 1, name: 'Mum', address: OTHER, avatar: 'data:image/jpeg;base64,AAAA', secret: 'x' }] },
  })
  const raw = env.EZ_SYNC.store.get(`bak:${me.address.toLowerCase()}`).v
  assert.equal(raw.includes('avatar'), false, 'avatar must NOT appear in KV')
  assert.equal(raw.includes('base64'), false)
  assert.equal(raw.includes('secret'), false)
})

test('junk addresses in contacts are dropped, long names truncated to 60 characters', async () => {
  const env = envWithKV()
  const { token } = await openSession(env)
  await call(env, {
    action: 'push', token,
    payload: { contacts: [{ id: 1, name: 'x'.repeat(200), address: OTHER }, { id: 2, name: 'junk', address: 'not-an-address' }] },
  })
  const doc = JSON.parse(env.EZ_SYNC.store.get(`bak:${me.address.toLowerCase()}`).v)
  assert.equal(doc.contacts.length, 1)
  assert.equal(doc.contacts[0].name.length, 60)
})

test('over 500 contacts → truncated to 500, and the write still succeeds', async () => {
  const env = envWithKV()
  const { token } = await openSession(env)
  const contacts = Array.from({ length: 620 }, (_, i) => ({ id: i, name: `n${i}`, address: OTHER }))
  const res = await (await call(env, { action: 'push', token, payload: { contacts } })).json()
  assert.equal(res.contacts, 500)
})

test('the 128KB cap catches a payload inflated through the id field (id has no type constraint)', async () => {
  const env = envWithKV()
  const { token } = await openSession(env)
  // 500 "clean" contacts are only ~75KB, so they never approach the byte cap - this cap blocks the other route:
  // `id` is kept exactly as the client sent it, and stuffing a long string in there is the only way to bloat KV.
  const contacts = Array.from({ length: 500 }, () => ({ id: 'x'.repeat(300), name: 'n', address: OTHER }))
  const res = await call(env, { action: 'push', token, payload: { contacts } })
  assert.equal(res.status, 413)
  assert.equal([...env.EZ_SYNC.store.keys()].filter(k => k.startsWith('bak:')).length, 0, 'when blocked, NOTHING may be written to KV')
})

test('pull with an empty server → data = null', async () => {
  const env = envWithKV()
  const { token } = await openSession(env)
  assert.equal((await (await call(env, { action: 'pull', token })).json()).data, null)
})

test('CHANGING AUTH LOSES NO DATA: a backup written by the old code still reads back', async () => {
  // The KV key is still `bak:<wallet address>` as it was in the userToken version → nothing to migrate.
  const old = JSON.stringify({ v: 1, updatedAt: 111, contacts: [{ id: 7, name: 'Grandma', address: OTHER }], savedQrs: [] })
  const env = envWithKV({ [`bak:${me.address.toLowerCase()}`]: old })
  const { token } = await openSession(env)
  const got = (await (await call(env, { action: 'pull', token })).json()).data
  assert.equal(got.contacts[0].name, 'Grandma')
})
