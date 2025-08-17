// pages/admin/index.js
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../supabase/client'

const ROLE_OPTIONS = [
  { value: 'executive', label: 'Executive' },
  { value: 'associate', label: 'Associate' },
  { value: 'member',    label: 'Member' },
]

export default function Admin() {
  const router = useRouter()
  const [me, setMe] = useState(null)
  const [myRole, setMyRole] = useState(null)

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  // Create user form
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('member')

  // Reset password (per-row)
  const [resetId, setResetId] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const isAssocOrExec = useMemo(() => myRole === 'executive' || myRole === 'associate', [myRole])
  const isExec        = useMemo(() => myRole === 'executive', [myRole])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setMe(user)
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setMyRole(prof?.role || null)
      await loadUsers()
      setLoading(false)
    })()
  }, [router])

  async function withAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    return {
      Authorization: `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json'
    }
  }

  async function parseJsonSafe(res) {
    try { return await res.json() } catch { return null }
  }

  async function loadUsers() {
    setErrorMsg('')
    try {
      const headers = await withAuthHeaders()
      const res = await fetch('/api/admin/users', { headers })
      const body = await parseJsonSafe(res)
      if (!res.ok) {
        throw new Error(body?.error || `Failed to load users (HTTP ${res.status})`)
      }
      setUsers(body?.users || [])
    } catch (e) {
      setUsers([])
      setErrorMsg(e.message || 'Failed to load users')
    }
  }

  async function onCreateUser(e) {
    e.preventDefault()
    setErrorMsg('')
    try {
      if (!email.trim() || !password.trim()) {
        throw new Error('Email and temporary password are required.')
      }
      const headers = await withAuthHeaders()
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: email.trim(), password: password.trim(), name: name.trim() || null, role })
      })
      const body = await parseJsonSafe(res)
      if (!res.ok) throw new Error(body?.error || `Failed to create user (HTTP ${res.status})`)
      setEmail(''); setPassword(''); setName(''); setRole('member')
      await loadUsers()
    } catch (e) {
      setErrorMsg(e.message)
    }
  }

  async function onChangeRole(userId, newRole) {
    setErrorMsg('')
    try {
      const headers = await withAuthHeaders()
      const res = await fetch('/api/admin/update-role', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, role: newRole })
      })
      const body = await parseJsonSafe(res)
      if (!res.ok) throw new Error(body?.error || `Failed to update role (HTTP ${res.status})`)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
    } catch (e) {
      setErrorMsg(e.message)
    }
  }

  async function onResetPassword(e) {
    e.preventDefault()
    setErrorMsg('')
    try {
      if (!resetId || !newPassword.trim()) {
        throw new Error('Select a user and enter a new password.')
      }
      const headers = await withAuthHeaders()
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId: resetId, newPassword: newPassword.trim() })
      })
      const body = await parseJsonSafe(res)
      if (!res.ok) throw new Error(body?.error || `Failed to reset password (HTTP ${res.status})`)
      setResetId(''); setNewPassword('')
      alert('Password updated.')
    } catch (e) {
      setErrorMsg(e.message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b132b] text-gray-300">
        Loading admin console…
      </div>
    )
  }

  if (!isAssocOrExec) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b132b] text-gray-200">
        You don’t have permission to view this page.
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b132b] text-gray-200">
      <header className="bg-[#1c2541] text-white shadow">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Admin Console</h1>
            <p className="text-sm text-gray-300">{me?.email} · Role: {myRole}</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/dashboard"
              className="px-3 py-2 rounded bg-[#3a506b] hover:bg-[#5bc0be] transition-colors text-sm"
              title="Back to Dashboard"
            >
              ← Dashboard
            </a>
            <a
              href="/admin/pools"
              className="px-3 py-2 rounded bg-[#3a506b] hover:bg-[#5bc0be] transition-colors text-sm"
              title="Create and manage role pools"
            >
              Role Pools
            </a>
            <button
              onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
              className="px-3 py-2 rounded bg-[#3a506b] hover:bg-[#5bc0be] transition-colors text-sm"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {errorMsg && (
          <div className="rounded bg-red-900/60 text-red-100 border border-red-400 px-4 py-2">
            {errorMsg}
          </div>
        )}

        {/* Create User (execs only) */}
        {isExec && (
          <section className="bg-[#1c2541] rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Create User</h2>
            <form onSubmit={onCreateUser} className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <input
                className="border border-gray-600 bg-[#0b132b] text-gray-200 rounded px-3 py-2"
                placeholder="Email"
                value={email}
                onChange={e=>setEmail(e.target.value)}
              />
              <input
                className="border border-gray-600 bg-[#0b132b] text-gray-200 rounded px-3 py-2"
                placeholder="Temp Password"
                value={password}
                onChange={e=>setPassword(e.target.value)}
              />
              <input
                className="border border-gray-600 bg-[#0b132b] text-gray-200 rounded px-3 py-2"
                placeholder="Name (optional)"
                value={name}
                onChange={e=>setName(e.target.value)}
              />
              <select
                className="border border-gray-600 bg-[#0b132b] text-gray-200 rounded px-3 py-2"
                value={role}
                onChange={e=>setRole(e.target.value)}
              >
                {ROLE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div className="md:col-span-1">
                <button className="w-full mt-1 px-4 py-2 bg-[#3a506b] hover:bg-[#5bc0be] text-white rounded transition-colors">
                  Create
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Users table */}
        <section className="bg-[#1c2541] rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Users</h2>
            <button
              onClick={loadUsers}
              className="px-3 py-1.5 bg-[#3a506b] hover:bg-[#5bc0be] rounded text-sm text-white"
              title="Reload users"
            >
              Refresh
            </button>
          </div>

          <div className="overflow-auto rounded border border-gray-700">
            <table className="min-w-full text-sm">
              <thead className="bg-[#142041]">
                <tr className="text-left text-gray-300 border-b border-gray-700">
                  <th className="py-2 px-3">Email</th>
                  <th className="py-2 px-3">Name</th>
                  <th className="py-2 px-3">Role</th>
                  <th className="py-2 px-3">Created</th>
                  {isAssocOrExec && <th className="py-2 px-3">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 px-3 text-center text-gray-400">
                      {errorMsg ? 'Unable to load users.' : 'No users found.'}
                    </td>
                  </tr>
                ) : users.map(u => (
                  <tr key={u.id} className="border-t border-gray-800">
                    <td className="py-2 px-3">{u.email}</td>
                    <td className="py-2 px-3">{u.name || '—'}</td>
                    <td className="py-2 px-3">
                      <select
                        className="border border-gray-600 bg-[#0b132b] text-gray-200 rounded px-2 py-1"
                        value={u.role}
                        onChange={(e) => onChangeRole(u.id, e.target.value)}
                      >
                        {ROLE_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3">{new Date(u.created_at).toLocaleDateString()}</td>
                    {isExec && (
                      <td className="py-2 px-3">
                        <form onSubmit={onResetPassword} className="flex gap-2 items-center">
                          <input type="hidden" value={u.id === resetId ? resetId : ''} readOnly />
                          <input
                            className="border border-gray-600 bg-[#0b132b] text-gray-200 rounded px-2 py-1"
                            placeholder="New password"
                            value={u.id === resetId ? newPassword : ''}
                            onChange={(e) => { setResetId(u.id); setNewPassword(e.target.value) }}
                          />
                          <button className="px-3 py-1 bg-[#3a506b] hover:bg-[#5bc0be] text-white rounded transition-colors">
                            Set
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
