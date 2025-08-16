// pages/admin/members.js
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../supabase/client'

const ROLES = ['executive', 'associate', 'member']

export default function MembersAdmin() {
  const router = useRouter()
  const [me, setMe] = useState(null)
  const [myRole, setMyRole] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  // Create user form
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('member')

  // Reset password form (inline per user)
  const [resetFor, setResetFor] = useState('')
  const [newPw, setNewPw] = useState('')

  // ---------- helpers ----------
  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    return {
      Authorization: `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json'
    }
  }

  async function loadUsers() {
    setErr('')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/users', { headers })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to load users')
      setUsers(body.users || [])
    } catch (e) {
      setErr(e.message)
    }
  }

  // ---------- boot ----------
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setMe(user)

      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      setMyRole(prof?.role || null)

      await loadUsers()
      setLoading(false)
    })()
  }, [router])

  const isExec = myRole === 'executive'
  const isAssocOrExec = isExec || myRole === 'associate'

  // ---------- actions ----------
  async function createUser(e) {
    e.preventDefault()
    setErr('')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, password, name, role })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Create failed')
      setEmail(''); setPassword(''); setName(''); setRole('member')
      await loadUsers()
    } catch (e) {
      setErr(e.message)
    }
  }

  async function changeRole(userId, newRole) {
    setErr('')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/update-role', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, role: newRole })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Update failed')
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
    } catch (e) {
      setErr(e.message)
    }
  }

  async function resetPassword(e, userId) {
    e.preventDefault()
    setErr('')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, newPassword: newPw })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Reset failed')
      setResetFor(''); setNewPw('')
      alert('Password updated.')
    } catch (e) {
      setErr(e.message)
    }
  }

  // ---------- UI ----------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-600">
        Loading…
      </div>
    )
  }

  if (!isAssocOrExec) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-700">
        No access
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-700 text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Manage Members</h1>
            <p className="text-sm text-blue-100">{me.email} · Role: {myRole}</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/admin" className="px-3 py-2 rounded bg-blue-600/40 hover:bg-blue-600/60 text-white text-sm">Admin Home</a>
            <a href="/dashboard" className="px-3 py-2 rounded bg-gray-900/40 hover:bg-gray-900/60 text-white text-sm">Dashboard</a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {err && <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded">{err}</div>}

        {/* Create user (Exec only) */}
        {isExec && (
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Create User</h2>
            <form onSubmit={createUser} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input className="border rounded px-3 py-2" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
              <input className="border rounded px-3 py-2" placeholder="Temp password" value={password} onChange={e=>setPassword(e.target.value)} required />
              <input className="border rounded px-3 py-2" placeholder="Name (optional)" value={name} onChange={e=>setName(e.target.value)} />
              <select className="border rounded px-3 py-2" value={role} onChange={e=>setRole(e.target.value)}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <div className="md:col-span-4">
                <button className="mt-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">Create</button>
              </div>
            </form>
          </section>
        )}

        {/* Users table */}
        <section className="bg-white rounded-lg shadow p-6 overflow-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Users</h2>
            <button onClick={loadUsers} className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-sm">Refresh</button>
          </div>

          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Created</th>
                {isExec && <th className="py-2">Reset Password</th>}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{u.email}</td>
                  <td className="py-2 pr-4">{u.name || '—'}</td>
                  <td className="py-2 pr-4">
                    <select
                      className="border rounded px-2 py-1"
                      value={u.role}
                      onChange={(e)=>changeRole(u.id, e.target.value)}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-4">{new Date(u.created_at).toLocaleDateString()}</td>
                  {isExec && (
                    <td className="py-2">
                      <form onSubmit={(e)=>resetPassword(e, u.id)} className="flex gap-2 items-center">
                        <input
                          className="border rounded px-2 py-1"
                          placeholder="New password"
                          value={resetFor === u.id ? newPw : ''}
                          onChange={(e)=>{ setResetFor(u.id); setNewPw(e.target.value) }}
                        />
                        <button className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded">Set</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <a href="/admin" className="text-blue-600 underline">← Back to Admin Home</a>
      </main>
    </div>
  )
}
