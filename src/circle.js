import { MOCK, MOCK_RATES } from './mock'

let sdk = null

// ============================================================
// CONFIG
// ============================================================
const API_BASE = ''

export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '51031114717-f9chve1ge9bbo8j3kspj82qrga40342n.apps.googleusercontent.com'

const CIRCLE_APP_ID =
  import.meta.env.VITE_CIRCLE_APP_ID ||
  '518fec6a-4680-5175-9de6-0810fb3dfd04'

// ============================================================
// CIRCLE SDK
// ============================================================
async function loadW3SSdk() {
  const m = await import('@circle-fin/w3s-pw-web-sdk')
  return m.W3SSdk
}

export async function getSDK() {
  if (MOCK) return {}
  if (!sdk) {
    const W3SSdk = await loadW3SSdk()
    sdk = new W3SSdk({
      appSettings: { appId: CIRCLE_APP_ID },
    })
  }
  return sdk
}

// ============================================================
// HTTP HELPER
// ============================================================
const REQUEST_TIMEOUT = 20_000

async function apiRequest(path, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    })
    const contentType = response.headers.get('content-type') || ''
    let data
    if (contentType.includes('application/json')) {
      data = await response.json()
    } else {
      const text = await response.text()
      data = text ? { message: text } : {}
    }
    if (!response.ok) {
      const error = new Error(
        data?.error ||
          data?.message ||
          `Request failed with status ${response.status}`,
      )
      error.status = response.status
      error.code = data?.code
      error.detail = data?.detail
      throw error
    }
    if (data?.error) {
      const error = new Error(data.error)
      error.code = data.code
      error.detail = data.detail
      throw error
    }
    return data
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

// ============================================================
// LOCAL SESSION
// ============================================================
const STORAGE_KEYS = {
  email: 'ez_email',
  userToken: 'ez_user_token',
  encryptionKey: 'ez_encryption_key',
  walletAddress: 'ez_wallet_addr',
  walletId: 'ez_wallet_id',
  refreshToken: 'ez_refresh_token',
  googleDeviceId: 'ez_google_deviceId',
  deviceId: 'ez_device_id',
}

function getStorage(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function setStorage(key, value) {
  try {
    if (value !== undefined && value !== null) localStorage.setItem(key, value)
  } catch {}
}
function removeStorage(key) {
  try { localStorage.removeItem(key) } catch {}
}
function clearLocalSession() {
  Object.values(STORAGE_KEYS).forEach(removeStorage)
}

// ============================================================
// PERSISTENT DEVICE ID
// ============================================================
//
// Circle requires a stable deviceId for email/social token calls.
// The SDK's `getDeviceId()` can return an empty string if its
// iframe hasn't loaded yet, so we generate and persist our own.
// The Circle backend fingerprints whatever deviceId we send it,
// so this value survives across sessions once created.
//
export function getOrCreateDeviceId() {
  const KEY = STORAGE_KEYS.deviceId
  try {
    let id = localStorage.getItem(KEY)
    if (id) return id
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      id = crypto.randomUUID()
    } else {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })
    }
    localStorage.setItem(KEY, id)
    return id
  } catch {
    return `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

// ============================================================
// EMAIL SESSION
// ============================================================
export async function createSession(email) {
  if (!email || typeof email !== 'string') {
    throw new Error('A valid email address is required.')
  }
  return apiRequest('/api/session', {
    method: 'POST',
    body: JSON.stringify({
      action: 'session',
      email: email.trim().toLowerCase(),
      deviceId: getOrCreateDeviceId(),
    }),
  })
}

// ============================================================
// EMAIL OTP
// ============================================================
export async function createEmailToken(deviceId, email) {
  if (!deviceId) {
    throw new Error('Device ID is required.')
  }
  if (!email) {
    throw new Error('Email address is required.')
  }
  return apiRequest('/api/session', {
    method: 'POST',
    body: JSON.stringify({
      action: 'emailToken',
      deviceId,
      email: email.trim().toLowerCase(),
    }),
  })
}

// ============================================================
// GOOGLE DEVICE ID
// ============================================================
export function getGoogleDeviceId() {
  let deviceId = getStorage(STORAGE_KEYS.googleDeviceId)
  if (deviceId) return deviceId
  deviceId = getOrCreateDeviceId()
  setStorage(STORAGE_KEYS.googleDeviceId, deviceId)
  return deviceId
}

// ============================================================
// GOOGLE LOGIN
// ============================================================
export async function createGoogleSession({ credential, deviceId }) {
  if (!credential) {
    throw new Error('Google sign-in credential is required.')
  }
  return apiRequest('/api/session', {
    method: 'POST',
    body: JSON.stringify({
      action: 'google',
      credential,
      deviceId: deviceId || getGoogleDeviceId(),
    }),
  })
}

export async function createSocialToken(deviceId) {
  return apiRequest('/api/session', {
    method: 'POST',
    body: JSON.stringify({
      action: 'socialToken',
      deviceId,
    }),
  })
}

// ============================================================
// WALLET
// ============================================================
export async function initializeWallet(userToken) {
  if (!userToken) throw new Error('Missing wallet session.')
  return apiRequest('/api/wallet', {
    method: 'POST',
    body: JSON.stringify({ action: 'initialize', userToken }),
  })
}

export async function getWalletAddress(userToken) {
  if (!userToken) return null
  try {
    return await apiRequest('/api/wallet', {
      method: 'POST',
      body: JSON.stringify({ action: 'getAddress', userToken }),
    })
  } catch (error) {
    console.error('[getWalletAddress]', error)
    return null
  }
}

export async function ensureWalletAddress() {
  const cachedAddress = getStorage(STORAGE_KEYS.walletAddress)
  if (cachedAddress) return cachedAddress
  const userToken = getStorage(STORAGE_KEYS.userToken)
  if (!userToken) return null
  try {
    const info = await getWalletAddress(userToken)
    if (info?.address) {
      setStorage(STORAGE_KEYS.walletAddress, info.address)
      if (info.walletId) setStorage(STORAGE_KEYS.walletId, info.walletId)
      return info.address
    }
  } catch (error) {
    console.error('[ensureWalletAddress]', error)
  }
  return null
}

// ============================================================
// SESSION REFRESH
// ============================================================
export async function refreshSocialToken(userToken, refreshToken, deviceId) {
  if (!refreshToken || !deviceId) {
    throw new Error('Google session cannot be refreshed.')
  }
  const data = await apiRequest('/api/session', {
    method: 'POST',
    body: JSON.stringify({
      action: 'refreshSocial',
      userToken,
      refreshToken,
      deviceId,
    }),
  })
  if (!data?.userToken) {
    throw new Error('Circle did not return a new session.')
  }
  return data
}

export async function refreshSession() {
  if (MOCK) return { userToken: 'mock-token', encryptionKey: 'mock-key' }
  const email = getStorage(STORAGE_KEYS.email)
  const fallback = {
    userToken: getStorage(STORAGE_KEYS.userToken),
    encryptionKey: getStorage(STORAGE_KEYS.encryptionKey),
  }

  if (email) {
    try {
      const session = await createSession(email)
      if (session?.userToken) setStorage(STORAGE_KEYS.userToken, session.userToken)
      if (session?.encryptionKey) setStorage(STORAGE_KEYS.encryptionKey, session.encryptionKey)
      return { userToken: session.userToken, encryptionKey: session.encryptionKey }
    } catch (error) {
      console.warn('[refreshSession email]', error)
      return fallback
    }
  }

  const refreshToken = getStorage(STORAGE_KEYS.refreshToken)
  const deviceId = getStorage(STORAGE_KEYS.googleDeviceId)
  if (refreshToken && deviceId) {
    try {
      const session = await refreshSocialToken(fallback.userToken, refreshToken, deviceId)
      if (session?.userToken) setStorage(STORAGE_KEYS.userToken, session.userToken)
      if (session?.encryptionKey) setStorage(STORAGE_KEYS.encryptionKey, session.encryptionKey)
      if (session?.refreshToken) setStorage(STORAGE_KEYS.refreshToken, session.refreshToken)
      return {
        userToken: session.userToken,
        encryptionKey: session.encryptionKey || fallback.encryptionKey,
      }
    } catch (error) {
      console.warn('[refreshSession google]', error)
      return fallback
    }
  }

  return fallback
}

export async function forceFreshSession() {
  if (MOCK) return { userToken: 'mock-token', encryptionKey: 'mock-key' }
  const email = getStorage(STORAGE_KEYS.email)
  let session

  if (email) {
    session = await createSession(email)
  } else {
    const refreshToken = getStorage(STORAGE_KEYS.refreshToken)
    const deviceId = getStorage(STORAGE_KEYS.googleDeviceId)
    if (!refreshToken || !deviceId) throw new Error('no-session')
    const refreshed = await refreshSocialToken(
      getStorage(STORAGE_KEYS.userToken),
      refreshToken,
      deviceId,
    )
    if (!refreshed?.userToken) throw new Error('Circle did not return a new session.')
    if (refreshed.refreshToken) setStorage(STORAGE_KEYS.refreshToken, refreshed.refreshToken)
    session = {
      userToken: refreshed.userToken,
      encryptionKey: refreshed.encryptionKey,
    }
  }

  if (!session?.userToken) throw new Error('Unable to create a new wallet session.')
  setStorage(STORAGE_KEYS.userToken, session.userToken)
  if (session.encryptionKey) setStorage(STORAGE_KEYS.encryptionKey, session.encryptionKey)
  return session
}

// ============================================================
// TOKEN ERROR DETECTION
// ============================================================
export function isTokenExpiredError(error) {
  const code = error?.code ?? error?.error?.code
  if ([155103, 155104, 155105].includes(code)) return true
  const message = (
    error?.message ||
    error?.error?.message ||
    (typeof error === 'string' ? error : '')
  ).toLowerCase()
  return /155103|155104|155105|token had expired|usertoken is invalid/.test(message)
}

// ============================================================
// SIGN MESSAGE
// ============================================================
export async function signMessageChallenge(userToken, walletId, message = 'Unlock Monyuny') {
  if (!userToken) throw new Error('Missing wallet session.')
  if (!walletId) throw new Error('Missing wallet ID.')
  const data = await apiRequest('/api/wallet', {
    method: 'POST',
    body: JSON.stringify({ action: 'signMessage', userToken, walletId, message }),
  })
  if (!data?.challengeId) throw new Error('Circle did not return a signing challenge.')
  return data.challengeId
}

// ============================================================
// SWAP
// ============================================================
function mockSwapOut(tokenIn, tokenOut, amountIn) {
  const rIn = MOCK_RATES[tokenIn] ?? 1
  const rOut = MOCK_RATES[tokenOut] ?? 1
  return String(((Number(amountIn) * rIn) / rOut).toFixed(6))
}

export async function estimateSwap({ walletAddress, tokenIn, tokenOut, amountIn }) {
  if (MOCK) return { amountOut: mockSwapOut(tokenIn, tokenOut, amountIn) }
  return apiRequest('/api/swap', {
    method: 'POST',
    body: JSON.stringify({ action: 'estimate', walletAddress, tokenIn, tokenOut, amountIn }),
  })
}

export async function executeSwap({
  userToken, walletId, walletAddress, tokenIn, tokenOut, amountIn,
}) {
  if (MOCK) {
    return { challengeId: 'mock-challenge', amountOut: mockSwapOut(tokenIn, tokenOut, amountIn) }
  }
  if (!userToken) throw new Error('Missing wallet session.')
  return apiRequest('/api/swap', {
    method: 'POST',
    body: JSON.stringify({
      action: 'execute',
      userToken,
      walletId,
      walletAddress,
      tokenIn,
      tokenOut,
      amountIn,
    }),
  })
}

// ============================================================
// PIN MANAGEMENT
// ============================================================
export async function resetPinChallenge(userToken) {
  if (!userToken) throw new Error('Missing wallet session.')
  const data = await apiRequest('/api/wallet', {
    method: 'POST',
    body: JSON.stringify({ action: 'resetPin', userToken }),
  })
  if (!data?.challengeId) throw new Error('Circle did not return a PIN reset challenge.')
  return data.challengeId
}

export async function restorePinChallenge(userToken) {
  if (!userToken) throw new Error('Missing wallet session.')
  const data = await apiRequest('/api/wallet', {
    method: 'POST',
    body: JSON.stringify({ action: 'restorePin', userToken }),
  })
  if (!data?.challengeId) {
    throw new Error('Circle did not return a PIN recovery challenge.')
  }
  return data.challengeId
}

// ============================================================
// CIRCLE ERROR HANDLING
// ============================================================
const RETRYABLE_CODES = new Set([155112, 155703, 155704, 155115, 155705])

const ERROR_BY_CODE = {
  155119:
    'Too many incorrect PIN attempts. Your wallet is temporarily locked. Please try again in a few minutes.',
  155120:
    'Too many incorrect answers. Your wallet is temporarily locked. Please try again in a few minutes.',
  155109: 'This account has been disabled.',
  155102: 'Account not found.',
  155110: 'This account has no PIN set.',
  155111: 'This account has no security questions set.',
  155103: 'Your session has expired. Please sign in again.',
  155104: 'Your session has expired. Please sign in again.',
  155105: 'Your session has expired. Please sign in again.',
  155130: 'The code has expired. Please request a new one.',
  155131: 'Invalid code.',
  155133: 'Incorrect code.',
  155134: 'The code does not match.',
  155706: 'Network error. Check your connection and try again.',
}

export function circleErrorMessage(error) {
  const code = error?.code ?? error?.error?.code
  const known = ERROR_BY_CODE[code]
  if (known) return known
  return (
    error?.message ||
    error?.error?.message ||
    (typeof error === 'string' ? error : '') ||
    'Something went wrong'
  )
}

// ============================================================
// EXECUTE CIRCLE CHALLENGE
// ============================================================
export function executeChallenge(sdkInstance, userToken, encryptionKey, challengeId) {
  if (MOCK) return Promise.resolve()
  if (!sdkInstance) {
    return Promise.reject(new Error('Circle SDK is not initialized.'))
  }
  if (!userToken || !encryptionKey || !challengeId) {
    return Promise.reject(new Error('Invalid Circle challenge session.'))
  }
  return new Promise((resolve, reject) => {
    try {
      sdkInstance.setAuthentication({ userToken, encryptionKey })
      sdkInstance.execute(challengeId, (error, result) => {
        if (error) {
          const code = error?.code ?? error?.error?.code
          console.error(
            '[Circle challenge]',
            'code=',
            code,
            '| retryable=',
            RETRYABLE_CODES.has(code),
            '|',
            error?.message || error?.error?.message,
          )
          if (RETRYABLE_CODES.has(code)) return
          const wrapped = Object.assign(new Error(circleErrorMessage(error)), {
            code,
            locked: code === 155119 || code === 155120,
          })
          reject(wrapped)
          return
        }
        resolve(result)
      })
    } catch (error) {
      reject(
        Object.assign(new Error(circleErrorMessage(error)), {
          code: error?.code ?? error?.error?.code,
        }),
      )
    }
  })
}

// ============================================================
// LOGOUT
// ============================================================
export async function logout() {
  try {
    await apiRequest('/api/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'logout' }),
    })
  } catch (error) {
    console.warn('[logout]', error)
  } finally {
    clearLocalSession()
    sdk = null
  }
}

// ============================================================
// SESSION STATUS
// ============================================================
export async function getSession() {
  try {
    return await apiRequest('/api/session', { method: 'GET' })
  } catch (error) {
    console.warn('[getSession]', error)
    return { authenticated: false }
  }
}

// ============================================================
// GOOGLE IDENTITY SERVICES HELPER
// ============================================================
let googleScriptPromise = null

export function loadGoogleIdentityServices() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Identity Services requires a browser.'))
  }
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  if (googleScriptPromise) return googleScriptPromise

  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]',
    )
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google), { once: true })
      existing.addEventListener(
        'error',
        () => reject(new Error('Unable to load Google Sign-In.')),
        { once: true },
      )
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve(window.google)
    script.onerror = () => reject(new Error('Unable to load Google Sign-In.'))
    document.head.appendChild(script)
  })
  return googleScriptPromise
}

export async function initializeGoogleLogin({
  onCredential,
  buttonElement,
  autoSelect = false,
  cancelOnTapOutside = true,
}) {
  if (typeof onCredential !== 'function') {
    throw new Error('Google login requires an onCredential callback.')
  }
  const google = await loadGoogleIdentityServices()
  if (!google?.accounts?.id) {
    throw new Error('Google Identity Services is unavailable.')
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: async (response) => {
      if (!response?.credential) {
        console.error('[Google Login] Missing credential.')
        return
      }
      try {
        await onCredential(response.credential)
      } catch (error) {
        console.error('[Google Login]', error)
      }
    },
    auto_select: autoSelect,
    cancel_on_tap_outside: cancelOnTapOutside,
  })
  if (buttonElement) {
    google.accounts.id.renderButton(buttonElement, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      width: 320,
    })
  }
  return google
}

export async function loginWithGoogleCredential(credential) {
  if (!credential) throw new Error('Google sign-in was not completed.')
  const deviceId = getGoogleDeviceId()
  const session = await createGoogleSession({ credential, deviceId })
  if (!session?.userToken) {
    throw new Error('Google sign-in succeeded, but the wallet session could not be created.')
  }
  setStorage(STORAGE_KEYS.userToken, session.userToken)
  if (session.encryptionKey) setStorage(STORAGE_KEYS.encryptionKey, session.encryptionKey)
  if (session.refreshToken) setStorage(STORAGE_KEYS.refreshToken, session.refreshToken)
  if (session.email) setStorage(STORAGE_KEYS.email, session.email)
  if (session.walletId) setStorage(STORAGE_KEYS.walletId, session.walletId)
  if (session.walletAddress) setStorage(STORAGE_KEYS.walletAddress, session.walletAddress)
  return session
}

// ============================================================
// EXPORTED SESSION UTILITIES
// ============================================================
export function getStoredSession() {
  return {
    email: getStorage(STORAGE_KEYS.email),
    userToken: getStorage(STORAGE_KEYS.userToken),
    encryptionKey: getStorage(STORAGE_KEYS.encryptionKey),
    walletId: getStorage(STORAGE_KEYS.walletId),
    walletAddress: getStorage(STORAGE_KEYS.walletAddress),
    googleDeviceId: getStorage(STORAGE_KEYS.googleDeviceId),
  }
}

export function getStoredWallet() {
  return {
    walletId: getStorage(STORAGE_KEYS.walletId),
    walletAddress: getStorage(STORAGE_KEYS.walletAddress),
  }
}