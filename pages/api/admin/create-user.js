// pages/api/admin/create-user.js
import { requireRole } from './_auth'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const ctx = await requireRole(req, res, ['executive'])
  if (!ctx) return
  const { admin } = ctx

  try {
    const { email, password, name, role = 'member' } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' })
    if (!['executive','associate','member'].includes(role)) return res.status(400).json({ error: 'invalid role' })

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true
    })
    if (createErr) return res.status(500).json({ error: createErr.message })

    const userId = created.user.id

    const { error: upsertErr } = await admin
      .from('profiles')
      .upsert({ id: userId, name: name || '', role }, { onConflict: 'id' })
    if (upsertErr) return res.status(500).json({ error: upsertErr.message })

    res.status(200).json({ ok: true, userId })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' })
  }
}
