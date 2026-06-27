export function studentName(s) {
  if (!s) return 'Unknown'
  return `${s.firstName}${s.lastName ? ' ' + s.lastName : ''}`.trim()
}

export function initials(s) {
  if (!s) return '?'
  const a = (s.firstName || '')[0] || ''
  const b = (s.lastName || '')[0] || ''
  return (a + b).toUpperCase() || '?'
}

export function studentById(state, id) {
  return state.students.find((s) => s.id === id)
}

// Read an image file, downscale to a square thumbnail, and return a compact JPEG data URL.
export function readImageScaled(file, max = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const side = Math.min(img.width, img.height)
        const canvas = document.createElement('canvas')
        canvas.width = max
        canvas.height = max
        const ctx = canvas.getContext('2d')
        // center-crop to a square, then scale into the thumbnail
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, max, max)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// Read an image file and downscale to fit within `max` on its longest edge,
// preserving aspect ratio (unlike readImageScaled, which crops to a square).
// Used for sending class-notes photos to the AI — keeps the whole page legible
// while limiting image tokens. Returns a JPEG data URL.
export function readImageForAI(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// Deterministic pastel avatar color from an id
export function avatarColor(id = '') {
  const palette = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444']
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}
