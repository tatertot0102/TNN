// pages/api/admin/_auth.js
import { supabaseAdmin } from '../../../supabase/admin'

export async function requireRole(req, res, allowedRoles = ['executive']) {
  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      res.status(401).json({ error: 'No session' })
      return null
    }

    const admin = supabaseAdmin()

    // validate the JWT to get the user
    const { data: userRes, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userRes?.user) {
      res.status(401).json({ error: 'Invalid session' })
      return null
    }

    const uid = userRes.user.id
    const { data: prof, error: profErr } = await admin
      .from('profiles')
      .select('role')
      .eq('id', uid)
      .single()

    if (profErr) {
      res.status(500).json({ error: profErr.message })
      return null
    }

    if (!allowedRoles.includes(prof.role)) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return null
    }

    return { admin, uid, role: prof.role }
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' })
    return null
  }
}
