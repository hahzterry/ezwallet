import { useState } from 'react'
import { useNav } from '../nav'
import {
  createSession,
  createEmailToken,
  getSDK,
  getOrCreateDeviceId,
  initializeWallet,
  executeChallenge,
  getWalletAddress,
  circleErrorMessage,
} from '../circle'

const DOMAINS = ['@gmail.com', '@yahoo.com', '@icloud.com']
const APP_ID = '518fec6a-4680-5175-9de6-0810fb3dfd04'
const EMAIL_OTP_ENABLED = true

function getEmailHistory() {
  try {
    return JSON.parse(localStorage.getItem('ez_email_history') || '[]')
  } catch {
    return []
  }
}

function saveEmailHistory(email) {
  const hist = getEmailHistory().filter((e) => e !== email)
  hist.unshift(email)
  localStorage.setItem('ez_email_history', JSON.stringify(hist.slice(0, 5)))
}

function Chip({ label, onClick, top }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        position: 'absolute',
        left: '10.51%',
        top,
        height: 32,
        maxWidth: '79%',
        padding: '0 12px',
        border: '1px solid var(--color-brand)',
        borderRadius: 8,
        background: 'var(--color-white)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 14,
        color: 'var(--color-brand)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

export default function LoginEmailPopup({ onClose }) {
  const { navigate } = useNav()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const showDomains = email.length > 0 && !email.includes('@')
  const history = getEmailHistory()
  const suggestions =
    email.length === 0
      ? history
      : history.filter(
          (e) =>
            e.toLowerCase().startsWith(email.toLowerCase()) && e !== email,
        )

  function applyDomain(d) {
    setEmail((e) => e + d)
    setError('')
  }

  async function finishOtpLogin(result, emailStr, deviceId) {
    const { userToken, encryptionKey, refreshToken } = result
    localStorage.setItem('ez_user_token', userToken)
    localStorage.setItem('ez_encryption_key', encryptionKey)
    if (refreshToken) localStorage.setItem('ez_refresh_token', refreshToken)
    localStorage.setItem('ez_google_deviceId', deviceId)
    localStorage.setItem('ez_google_email', emailStr)
    localStorage.setItem('ez_login_method', 'email')
    localStorage.removeItem('ez_email')
    localStorage.removeItem('ez_wallet_addr')
    localStorage.removeItem('ez_wallet_id')

    const walletData = await initializeWallet(userToken)
    const challengeId = walletData?.data?.challengeId
    if (challengeId) {
      await executeChallenge(await getSDK(), userToken, encryptionKey, challengeId)
    }

    let info = null
    for (let i = 0; i < 3 && !info?.address; i++) {
      info = await getWalletAddress(userToken)
      if (!info?.address) await new Promise((r) => setTimeout(r, 2000))
    }
    if (info?.address) localStorage.setItem('ez_wallet_addr', info.address)
    if (info?.walletId) localStorage.setItem('ez_wallet_id', info.walletId)
    saveEmailHistory(emailStr)
    sessionStorage.setItem('ez_pin_ok', '1')
    navigate('HomeSend')
  }

  async function handleSubmit() {
    if (!valid || loading) return
    setLoading(true)
    setError('')

    if (EMAIL_OTP_ENABLED) {
      const em = email.trim()
      try {
        const sdk = await getSDK()

        // ⚠️ The SDK's getDeviceId() can return an empty string if its
        // internal iframe has not finished loading. We always use our
        // own persistent deviceId, and only prefer the SDK's value when
        // it is non-empty.
        let deviceId = getOrCreateDeviceId()
        try {
          const sdkDeviceId = await sdk.getDeviceId()
          if (sdkDeviceId) deviceId = sdkDeviceId
        } catch (e) {
          console.warn('[LoginEmailPopup] sdk.getDeviceId failed:', e)
        }

        const { otpToken, deviceToken, deviceEncryptionKey } =
          await createEmailToken(deviceId, em)

        sdk.updateConfigs(
          {
            appSettings: { appId: APP_ID },
            loginConfigs: { deviceToken, deviceEncryptionKey, otpToken },
          },
          async (error, result) => {
            if (error) {
              if (error?.code === 155701) {
                setLoading(false)
                return
              }
              setError(circleErrorMessage(error))
              setLoading(false)
              return
            }
            if (!result?.userToken) {
              setLoading(false)
              return
            }
            try {
              await finishOtpLogin(result, em, deviceId)
            } catch (e) {
              setError(circleErrorMessage(e))
              setLoading(false)
            }
          },
        )
        sdk.verifyOtp()
      } catch (e) {
        setError(circleErrorMessage(e))
        setLoading(false)
      }
      return
    }

    // ── Old flow (flag off): direct email + PIN, NO email verification ──
    try {
      localStorage.removeItem('ez_wallet_addr')
      localStorage.removeItem('ez_wallet_id')
      const { userToken, encryptionKey } = await createSession(email.trim())
      localStorage.setItem('ez_user_token', userToken)
      localStorage.setItem('ez_encryption_key', encryptionKey)
      localStorage.setItem('ez_email', email.trim())
      const sdk = await getSDK()
      const walletData = await initializeWallet(userToken)
      const challengeId = walletData?.data?.challengeId
      if (challengeId) {
        await executeChallenge(sdk, userToken, encryptionKey, challengeId)
      }

      const freshSession = await createSession(email.trim())
      const freshToken = freshSession.userToken
      localStorage.setItem('ez_user_token', freshToken)
      localStorage.setItem('ez_encryption_key', freshSession.encryptionKey)

      let walletInfo = null
      for (let i = 0; i < 3; i++) {
        walletInfo = await getWalletAddress(freshToken)
        if (walletInfo?.address) break
        await new Promise((r) => setTimeout(r, 2000))
      }
      if (walletInfo?.address) {
        localStorage.setItem('ez_wallet_addr', walletInfo.address)
      }
      if (walletInfo?.walletId) {
        localStorage.setItem('ez_wallet_id', walletInfo.walletId)
      }

      saveEmailHistory(email.trim())
      if (challengeId) {
        sessionStorage.setItem('ez_pin_ok', '1')
        navigate('HomeSend')
      } else {
        navigate('PinGate', { next: 'HomeSend' })
      }
    } catch (e) {
      setError(circleErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  const chips =
    suggestions.length > 0
      ? suggestions.map((s) => ({
          label: s,
          onClick: () => {
            setEmail(s)
            setError('')
          },
        }))
      : showDomains
        ? DOMAINS.map((d) => ({ label: d, onClick: () => applyDomain(d) }))
        : []

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 100 }}>
      <div
        style={{
          position: 'absolute',
          left: '6.41%',
          top: '10.19dvh',
          width: '87.18%',
          height: '49.05dvh',
          background: 'var(--color-white)',
          borderRadius: 16,
          boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '14.34dvh',
          transform: 'translate(-50%, -50%)',
          width: '87.18%',
          textAlign: 'center',
          fontSize: 24,
          fontWeight: 'var(--fw-semibold)',
          lineHeight: '30px',
          color: 'var(--color-black)',
        }}
      >
        Log in with email
      </div>

      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="example@gmail.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          setError('')
        }}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        autoFocus
        style={{
          position: 'absolute',
          left: '50%',
          top: '22.04dvh',
          transform: 'translateX(-50%)',
          width: '78.96%',
          height: 40,
          background: '#D2DCE6',
          border: 'none',
          borderRadius: 8,
          outline: 'none',
          padding: '0 12px',
          fontSize: 18,
          color: 'var(--color-black)',
        }}
      />

      {chips.map((c, i) => (
        <Chip
          key={c.label}
          label={c.label}
          onClick={c.onClick}
          top={`${((236 + i * 42) / 844) * 100}dvh`}
        />
      ))}

      {error && (
        <div
          style={{
            position: 'absolute',
            left: '10.51%',
            right: '10.51%',
            top: '46.5dvh',
            fontSize: 14,
            color: 'var(--color-error)',
          }}
        >
          {error}
        </div>
      )}

      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          left: '10.54%',
          top: '50.95dvh',
          width: '38.43%',
          height: 48,
          background: 'var(--color-white)',
          color: 'var(--color-black)',
          border: 'none',
          borderRadius: 16,
          boxShadow: '0 0 8px rgba(0, 0, 0, 0.48)',
          fontFamily: 'inherit',
          fontSize: 18,
          fontWeight: 'var(--fw-semibold)',
          cursor: 'pointer',
        }}
      >
        Back
      </button>
      <button
        onClick={handleSubmit}
        disabled={!valid || loading}
        style={{
          position: 'absolute',
          left: '51.03%',
          top: '50.95dvh',
          width: '38.46%',
          height: 48,
          background: 'var(--color-brand)',
          color: 'var(--color-white)',
          border: 'none',
          borderRadius: 16,
          boxShadow: '0 0 8px rgba(0, 0, 0, 0.48)',
          fontFamily: 'inherit',
          fontSize: 18,
          fontWeight: 'var(--fw-semibold)',
          cursor: valid && !loading ? 'pointer' : 'not-allowed',
          opacity: valid && !loading ? 1 : 0.5,
        }}
      >
        {loading ? 'Processing...' : 'Continue'}
      </button>
    </div>
  )
}