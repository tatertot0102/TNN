// pages/admin/index.js
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../supabase/client'

const ROLE_OPTIONS = [
  { value: 'executive', label: 'Executive' },
  { value: 'associate', label: 'Associate' },
  { value: 'member', label: 'Member' },
]

export default function Admin() {
  const router = useRouter()
  const [me, setMe] = useState(null)
  const [myRole, setMyRole] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  // Create user form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('member')

  // Reset password state
  const [resetId, setResetId] = useState('')
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }
      setMe(user)

      // fetch my profile role
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

  async function loadUsers() {
    setErrorMsg('')
    try {
      const headers = await withAuthHeaders()
      const res = await fetch('/api/admin/users', { headers })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load users')
      const data = await res.json()
      setUsers(data.users || [])
    } catch (e) {
      setErrorMsg(e.message)
    }
  }

  async function onCreateUser(e) {
    e.preventDefault()
    setErrorMsg('')
    try {
      const headers = await withAuthHeaders()
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, password, name, role })
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create user')
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
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update role')
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
    } catch (e) {
      setErrorMsg(e.message)
    }
  }

  async function onResetPassword(e) {
    e.preventDefault()
    setErrorMsg('')
    try {
      const headers = await withAuthHeaders()
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId: resetId, newPassword })
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to reset password')
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

  const isExec = myRole === 'executive'
  const isAssocOrExec = myRole === 'executive' || myRole === 'associate'

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
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold">Admin Console</h1>
            <p className="text-sm text-gray-300">{me.email} · Role: {myRole}</p>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
            className="px-4 py-2 rounded bg-[#3a506b] hover:bg-[#5bc0be] transition-colors text-sm"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {errorMsg && (
          <div className="rounded bg-red-900 text-red-200 border border-red-400 px-4 py-2">
            {errorMsg}
          </div>
        )}

        {isExec && (
          <section className="bg-[#1c2541] rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Create User</h2>
            <form onSubmit={onCreateUser} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input className="border border-gray-500 bg-[#0b132b] text-gray-200 rounded px-3 py-2" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
              <input className="border border-gray-500 bg-[#0b132b] text-gray-200 rounded px-3 py-2" placeholder="Temp Password" value={password} onChange={e=>setPassword(e.target.value)} />
              <input className="border border-gray-500 bg-[#0b132b] text-gray-200 rounded px-3 py-2" placeholder="Name (optional)" value={name} onChange={e=>setName(e.target.value)} />
              <select className="border border-gray-500 bg-[#0b132b] text-gray-200 rounded px-3 py-2" value={role} onChange={e=>setRole(e.target.value)}>
                {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div className="md:col-span-4">
                <button className="mt-1 px-4 py-2 bg-[#3a506b] hover:bg-[#5bc0be] text-white rounded transition-colors">
                  Create
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="bg-[#1c2541] rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Users</h2>
            <button onClick={loadUsers} className="px-3 py-1.5 bg-[#3a506b] hover:bg-[#5bc0be] rounded text-sm text-white">Refresh</button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-300 border-b border-gray-500">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2">Created</th>
                  {isAssocOrExec && <th className="py-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-gray-700 last:border-0">
                    <td className="py-2 pr-4">{u.email}</td>
                    <td className="py-2 pr-4">{u.name || '—'}</td>
                    <td className="py-2 pr-4">
                      <select
                        className="border border-gray-500 bg-[#0b132b] text-gray-200 rounded px-2 py-1"
                        value={u.role}
                        onChange={(e) => onChangeRole(u.id, e.target.value)}
                      >
                        {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="py-2">{new Date(u.created_at).toLocaleDateString()}</td>
                    {isExec && (
                      <td className="py-2">
                        <form onSubmit={onResetPassword} className="flex gap-2 items-center">
                          <input type="hidden" value={resetId} onChange={()=>{}} />
                          <input
                            className="border border-gray-500 bg-[#0b132b] text-gray-200 rounded px-2 py-1"
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
