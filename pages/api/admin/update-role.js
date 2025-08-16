// pages/api/admin/update-role.js
import { requireRole } from './_auth'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const ctx = await requireRole(req, res, ['executive', 'associate'])
  if (!ctx) return
  const { admin } = ctx

  try {
    const { userId, role } = req.body || {}
    if (!userId || !['executive','associate','member'].includes(role)) {
      return res.status(400).json({ error: 'userId and valid role are required' })
    }

    const { error } = await admin.from('profiles').update({ role }).eq('id', userId)
    if (error) return res.status(500).json({ error: error.message })

    res.status(200).json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' })
  }
}
