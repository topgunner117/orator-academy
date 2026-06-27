import { Router } from 'express'
import * as store from '../services/store.js'

const router = Router()

// Whole-state sync. The browser loads this on boot and writes back (debounced) on change.
// GET → { state, version }.  PUT { state, baseVersion } → { state, version } (reconciled).
router.get('/', async (req, res, next) => {
  try {
    res.json(await store.getState())
  } catch (err) {
    next(err)
  }
})

router.put('/', async (req, res, next) => {
  try {
    const { state, baseVersion = 0 } = req.body || {}
    if (!state || typeof state !== 'object') return res.status(400).json({ error: 'Missing state.' })
    res.json(await store.saveState(state, baseVersion))
  } catch (err) {
    next(err)
  }
})

export default router
