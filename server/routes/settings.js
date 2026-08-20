import { Router } from 'express'
import { getDB } from '../db.js'

export const settingsRouter = Router()

settingsRouter.get('/', (_req, res) => {
  const rows = getDB().prepare('SELECT key, value FROM settings').all()
  const settings = {}
  for (const row of rows) settings[row.key] = row.value
  res.json(settings)
})

settingsRouter.put('/', (req, res) => {
  const db = getDB()
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  const tx = db.transaction((entries) => {
    for (const [key, value] of entries) upsert.run(key, String(value))
  })
  tx(Object.entries(req.body))
  res.json({ ok: true })
})
