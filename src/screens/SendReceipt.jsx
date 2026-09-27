import { useEffect } from 'react'
import { useNav } from '../nav'
import Icon from '../components/Icon'
import { fmtMoney, shortenAddr } from '../data'
import { addNotif } from '../notif'
import { saveImageToPhotos } from '../saveImage'
import logoLong from '../../design/logo.png'
import ScreenSheet from '../components/ScreenSheet'
import ExitBar from '../components/ExitBar'
import { GRADIENT } from '../brandBg'

// Big GREEN check icon (success) - check.svg already includes the outlined circle and the tick.
// 70px (was 76) - node 1:238's exact placeholder size.
function CheckIcon() {
  return <Icon name="check" size={70} color="var(--color-primary)" />
}

function fmtTime(ts) {
  return new Date(ts).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function SendReceipt() {
  const { navigate, params } = useNav()
  // Defaults to 'USD' (it used to be 'VND' - a leftover from when the app counted in VND). Since 08-04 VND is a REAL
  // currency, so a wrong default would render a receipt with a missing currency as Vietnamese money.
  const { address, name, amount, memo, currency = 'USD', timestamp } = params
  const to = name || shortenAddr(address)
  // "$2" as one string in one style (NOT a bold "2" plus a regular "USD" - user decision)
  const amountText = currency === 'VND' ? `${Number(amount).toLocaleString('vi-VN')} ₫` : fmtMoney(amount, currency)
  // The REAL token moved on-chain (USD = a label, USDC actually moves 1:1) - shown plainly on the receipt
  // so sender and recipient can reconcile the actual asset (nobody should read a label and assume another token).
  // ⚠️ VND is NOT a token: what actually moves is USDC, and the USDC figure ≠ the VND typed → you must use
  // params.tokenAmount (decided in SendAmount, forwarded by SendConfirm), never `amount`.
  const realToken = currency === 'USD' || currency === 'VND' ? 'USDC' : currency
  const realUnits = currency === 'VND' ? (params.tokenAmount ?? 0) : Number(amount)
  const realAmountText = `${realToken === 'cirBTC' ? realUnits.toFixed(8) : realUnits.toFixed(2)} ${realToken}`

  // Store the "sent" notification for HomeSend to show. dedupeKey is the timestamp (unique per real send)
  // → guards against duplication from React.StrictMode running the effect twice in dev mode.
  useEffect(() => {
    addNotif(`Sent ${amountText} to ${to}`, 'sent', null, `sent-${timestamp}`)
  }, [])

  // Draw the receipt onto a canvas, then save it to the photo library
  async function saveReceipt() {
    // Height = bottom of the last row + 50 breathing space + logo + 22 margin (user decision 07-23: the logo used to
    // touch the last row's divider). 3 fixed rows = 590; the Address row (only when named) / Note row add 60 each.
    const W = 620, H = 590 + (name && address ? 60 : 0) + (memo ? 60 : 0)
    const cv = document.createElement('canvas')
    cv.width = W; cv.height = H
    const x = cv.getContext('2d')
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H)
    // Big GREEN check icon (outlined circle + tick, same style as check.svg) - success
    x.strokeStyle = '#16A34A'; x.lineWidth = 8; x.lineCap = 'round'; x.lineJoin = 'round'
    x.beginPath(); x.arc(W / 2, 90, 44, 0, Math.PI * 2); x.stroke()
    x.beginPath(); x.moveTo(W / 2 - 20, 90); x.lineTo(W / 2 - 6, 105); x.lineTo(W / 2 + 22, 73); x.stroke()
    x.textAlign = 'center'
    x.fillStyle = '#000000'; x.font = '600 32px sans-serif'; x.fillText('Sent successfully', W / 2, 180)
    x.fillStyle = '#0B53BF'; x.font = '700 52px sans-serif'; x.fillText(amountText, W / 2, 245)
    // the rows
    let yy = 320
    const row = (label, val) => {
      x.textAlign = 'left'; x.fillStyle = '#AEAEB2'; x.font = '22px sans-serif'; x.fillText(label, 50, yy)
      x.textAlign = 'right'; x.fillStyle = '#000000'; x.font = '500 22px sans-serif'; x.fillText(val, W - 50, yy)
      x.strokeStyle = '#E5E5EA'; x.lineWidth = 1; x.beginPath(); x.moveTo(50, yy + 22); x.lineTo(W - 50, yy + 22); x.stroke()
      yy += 60
    }
    row('Send to', to)
    if (name && address) row('Address', shortenAddr(address))   // shortened; only when Send to = a contact name
    row('Amount', realAmountText)
    if (memo) row('Note', memo)
    row('Time', fmtTime(timestamp))
    // The ezwallet logo (the standard branding - design/logo.svg, brand-blue EZ + black wallet) at the bottom -
    // anchored to the canvas BOTTOM, H already reserves 50px of breathing space after the last row (keep the logo off the divider)
    const lw = 168, lh = lw * 71 / 201   // aspect ratio of logo.svg (viewBox 201×71)
    const img = new Image()
    img.src = logoLong
    try { await img.decode() } catch {}
    x.drawImage(img, (W - lw) / 2, H - 22 - lh, lw, lh)
    saveImageToPhotos(cv, `bien-lai-${timestamp}.png`)
  }

  return (
    <div className="screen" style={{ background: GRADIENT }}>
      <ScreenSheet />
      <div className="sheet-title">Transaction completed</div>

      {/* Check icon - node 1:238: centre 24.53dvh (= row 3's centre exactly). */}
      <div style={{ position: 'absolute', left: '50%', top: '24.53dvh', transform: 'translate(-50%, -50%)' }}>
        <CheckIcon />
      </div>

      {/* "Sent successfully" - node 1:234: top-anchored (no vertical centring in the Figma layer), 18px
          semibold (was --fs-body 19 medium). */}
      <span style={{ position: 'absolute', left: '50%', top: '30.08dvh', transform: 'translateX(-50%)', fontSize: 'var(--fs-content-1)', fontWeight: 'var(--fw-semibold)', color: 'var(--color-content)' }}>
        Sent successfully
      </span>

      {/* Amount - node 1:237: top-anchored, 48px semibold (was --fs-amount 52) - its box ends exactly
          where the card below begins (344px = card top). */}
      <span className="num" style={{ position: 'absolute', left: '50%', top: '33.29dvh', transform: 'translateX(-50%)', fontSize: 48, fontWeight: 'var(--fw-semibold)', color: 'var(--color-brand)' }}>
        {amountText}
      </span>

      {/* Card - node 1:236: centre 55.09dvh, 339×242 (the familiar 3-row-tall card: 3×70+2×16=242),
          radius 16 (fixed on the shared .confirm-box class). */}
      <div style={{ position: 'absolute', left: '6.41%', right: '6.41%', top: '55.09dvh', height: '28.67dvh', transform: 'translateY(-50%)' }}>
        <div className="confirm-box" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="confirm-row">
            <span className="confirm-label">Send to</span>
            <span className="confirm-value">{to}</span>
          </div>
          {/* SHORTENED wallet address 0x1234…5678 (user decision 07-23: not the full one, it is long and ugly). Shown ONLY when
              Send to is a contact NAME - without a name, Send to is already the shortened address, so this would repeat it. */}
          {name && address ? (
            <div className="confirm-row">
              <span className="confirm-label">Address</span>
              <span className="confirm-value num">{shortenAddr(address)}</span>
            </div>
          ) : null}
          <div className="confirm-row">
            <span className="confirm-label">Amount</span>
            <span className="confirm-value num" style={{ fontSize: 'var(--fs-h2)', fontWeight: 'var(--fw-semibold)', color: 'var(--color-brand)' }}>{realAmountText}</span>
          </div>
          {memo ? (
            <div className="confirm-row">
              <span className="confirm-label">Note</span>
              <span className="confirm-value">{memo}</span>
            </div>
          ) : null}
          <div className="confirm-row">
            <span className="confirm-label">Time</span>
            <span className="confirm-value" style={{ fontSize: 'var(--fs-content-1)' }}>{fmtTime(timestamp)}</span>
          </div>
        </div>
      </div>

      {/* Save receipt/Done - node 1:230-1:233: both exactly 166px, i.e. (340 − 8) / 2 - flex:1 with an
          8px gap. Centre 85.63dvh, glow shadow. */}
      <div style={{ position: 'absolute', left: '6.41%', right: '6.41%', top: '85.66dvh', transform: 'translateY(-50%)', display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary" style={{ flex: 1, boxShadow: '0 0 8px rgba(0, 0, 0, 0.48)' }} onClick={saveReceipt}>Save receipt</button>
        <button className="btn btn-primary" style={{ flex: 1, boxShadow: '0 0 8px rgba(0, 0, 0, 0.48)' }} onClick={() => navigate('HomeSend')}>Done</button>
      </div>

      <ExitBar onClick={() => navigate('HomeSend')} />
    </div>
  )
}
