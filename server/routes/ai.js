import { Router } from 'express'
import { parseNotes } from '../services/anthropic.js'
import * as store from '../services/store.js'

const router = Router()

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '')

// Match a model-returned name to a roster student id. Tries full name, then first name,
// then a loose startsWith. Returns { id, confident } or { id: null }.
function matchStudent(name, roster) {
  const n = norm(name)
  if (!n) return { id: null, confident: false }
  let hit = roster.find((s) => norm(s.name) === n)
  if (hit) return { id: hit.id, confident: true }
  const first = norm((name || '').trim().split(/\s+/)[0])
  hit = roster.find((s) => norm((s.name || '').split(/\s+/)[0]) === first)
  if (hit) return { id: hit.id, confident: true }
  hit = roster.find((s) => norm(s.name).startsWith(n) || n.startsWith(norm(s.name)))
  return hit ? { id: hit.id, confident: false } : { id: null, confident: false }
}

router.post('/parse-notes', async (req, res, next) => {
  try {
    const { image, className, date, roster = [] } = req.body || {}
    if (!image) return res.status(400).json({ error: 'Missing image.' })

    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(image)
    if (!m) return res.status(400).json({ error: 'Image must be a base64 data URL.' })
    const [, mediaType, imageBase64] = m

    const { result, mock, model } = await parseNotes({
      imageBase64,
      mediaType,
      context: { className, date, roster },
    })

    // Attach roster matches to each student so the client can pre-select.
    const students = (result.students || []).map((s) => {
      const match = matchStudent(s.name, roster)
      return { ...s, matchedStudentId: match.id, matchConfident: match.confident }
    })

    // Dev Console: log this image-parse trigger (what Claude read), even in dev-mock.
    const approxKB = Math.round((imageBase64.length * 3) / 4 / 1024)
    await store.logEvent({
      kind: 'photo',
      model,
      mock,
      summary: `Image parsed (${mediaType}, ~${approxKB}KB) → ${result.classGoals?.length || 0} class goals, ${students.length} student blocks`,
      detail: {
        context: { className: className || null, date: date || null, roster: roster.map((r) => r.name) },
        image: { mediaType, approxKB },
        read: { classGoals: result.classGoals || [], classNotes: result.classNotes || '', students },
      },
    })

    res.json({ mock, model, result: { ...result, students } })
  } catch (err) {
    next(err)
  }
})

export default router
