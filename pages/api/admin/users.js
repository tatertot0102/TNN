// pages/api/admin/users.js
import { requireRole } from './_auth'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const ctx = await requireRole(req, res, ['executive', 'associate'])
  if (!ctx) return
  const { admin } = ctx

  try {
    const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listErr) return res.status(500).json({ error: listErr.message })

    const authUsers = listData?.users || []
    const ids = authUsers.map(u => u.id)

    const { data: profiles, error: profErr } = await admin
      .from('profiles')
      .select('id, name, role')
      .in('id', ids)

    if (profErr) return res.status(500).json({ error: profErr.message })

    const map = new Map((profiles || []).map(p => [p.id, p]))
    const users = authUsers.map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      name: map.get(u.id)?.name || '',
      role: map.get(u.id)?.role || 'member'
    }))

    res.status(200).json({ users })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' })
  }
}
