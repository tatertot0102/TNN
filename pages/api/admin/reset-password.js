// pages/api/admin/reset-password.js
import { requireRole } from './_auth'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const ctx = await requireRole(req, res, ['executive'])
  if (!ctx) return
  const { admin } = ctx

  try {
    const { userId, newPassword } = req.body || {}
    if (!userId || !newPassword) return res.status(400).json({ error: 'userId and newPassword are required' })

    const { data, error } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
    if (error) return res.status(500).json({ error: error.message })

    res.status(200).json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' })
  }
}
