import logoLong from '../design/logo.png'

// ══ BRANDED QR IMAGE - shared by EVERY place that shares a QR (user decision 08-13) ══
// Takes a bare QR canvas → returns a new canvas: QR + the words "Only Arc Testnet" + the ezwallet logo.
// Used by: the Receive screen (Share) and the ShowQR screen (a created QR / a QR from the library).
//
// ⚠️ DELIBERATELY does not draw the wallet address onto the image (user decision 08-13: "putting the address on the QR looks awful").
// The Receive screen sends the address as TEXT alongside the image; ShowQR sends no address at all (people
// scan the QR to get it, and what matters there is the AMOUNT, not the address).
//
// The network label MUST be on the image: this image leaves the app, and the recipient has nothing else
// telling them which chain it is. See also the network-lock rule in src/qr.js.
export async function brandedQrCanvas(qrCanvas) {
  const W = 620, QR = 420, PAD = 50
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = 640
  const x = cv.getContext('2d')
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, cv.height)
  x.drawImage(qrCanvas, (W - QR) / 2, PAD, QR, QR)

  x.textAlign = 'center'
  x.fillStyle = '#0B53BF'; x.font = '600 30px sans-serif'
  x.fillText('Only Arc Testnet', W / 2, PAD + QR + 58)

  const lw = 168, lh = lw * 71 / 201   // logo.svg aspect ratio (viewBox 201×71), same as the receipt image
  const img = new Image()
  img.src = logoLong
  try { await img.decode() } catch {}
  x.drawImage(img, (W - lw) / 2, cv.height - 30 - lh, lw, lh)
  return cv
}

// Save a canvas image to the PHOTO LIBRARY (iOS: Web Share API → "Save Image" into Photos, not Files).
// Fallback (desktop / unsupported): download the file.
//
// ⚠️ THE `text` ARGUMENT (08-13): including text makes iOS FILTER the apps offered in the share sheet (Messages
// can disappear). The user KNOWS and ACCEPTED that trade-off for the Receive screen: "as long as it shares 2 things,
// not 1" - the wallet address has to travel with the image. Do NOT drop `text` to "fix" the app list.
// The ShowQR screen passes NO text (image only) - also the user's call.
export function saveImageToPhotos(canvas, filename, text) {
  canvas.toBlob(async (blob) => {
    if (!blob) return
    const file = new File([blob], filename, { type: 'image/png' })
    // Include the text (wallet address) so the share still carries the address; sharing a FILE → iOS offers "Save Image".
    const payload = text ? { files: [file], text } : { files: [file] }
    if (navigator.canShare && navigator.canShare(payload)) {
      try { await navigator.share(payload); return } catch (e) { if (e?.name === 'AbortError') return }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, 'image/png')
}
