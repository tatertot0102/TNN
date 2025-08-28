// pages/admin/pools.js
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../supabase/client'

const ROLE_KEYS = [
  { value: 'script_editor', label: 'Script Editor' },
  { value: 'content_strategist', label: 'Content Strategist' },
  { value: 'director', label: 'Director' },
  { value: 'post_supervisor', label: 'Post Supervisor' },
  { value: 'producer', label: 'Producer' },
  { value: 'publisher', label: 'Publisher' }
]

function roleLabel(v) {
  return ROLE_KEYS.find(r => r.value === v)?.label || v
}

export default function PoolsAdmin() {
  const router = useRouter()
  const [me, setMe] = useState(null)
  const [profile, setProfile] = useState(null)

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  const [pools, setPools] = useState([])        // [{id, name, role_key}]
  const [selPoolId, setSelPoolId] = useState(null)

  const [people, setPeople] = useState([])      // [{id, name, email, role}]
  const [members, setMembers] = useState([])    // [{user_id}]
  const memberIds = useMemo(() => new Set(members.map(m => m.user_id)), [members])

  // Create/Rename/Delete state
  const [newRole, setNewRole] = useState('script_editor')
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  // Search
  const [search, setSearch] = useState('')

  // Guards
  const isExec = useMemo(
    () => profile?.role === 'executive' || profile?.role === 'associate',
    [profile]
  )

  // Load auth + profile
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setMe(user)
      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof || null)
    })()
  }, [router])

  // Load pools + people
  const loadAll = useCallback(async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const [{ data: pls, error: e1 }, { data: ppl, error: e2 }] = await Promise.all([
        supabase.from('role_pools').select('id, name, role_key').order('name', { ascending: true }),
        supabase.from('profiles').select('id, name, email, role').order('name', { ascending: true })
      ])
      if (e1) throw e1
      if (e2) throw e2
      setPools(pls || [])
      setPeople(ppl || [])
      if ((pls || []).length && !selPoolId) setSelPoolId(pls[0].id)
    } catch (e) {
      setErrorMsg(e.message || 'Failed to load pools or people')
    } finally {
      setLoading(false)
    }
  }, [selPoolId])

  useEffect(() => { if (isExec) loadAll() }, [isExec, loadAll])

  // Load members for selected pool
  const loadMembers = useCallback(async () => {
    if (!selPoolId) { setMembers([]); return }
    const { data, error } = await supabase
      .from('role_pool_members')
      .select('user_id')
      .eq('pool_id', selPoolId)
    if (error) { setErrorMsg(error.message); return }
    setMembers(data || [])
  }, [selPoolId])

  useEffect(() => { if (selPoolId) loadMembers() }, [selPoolId, loadMembers])

  // Create pool
  async function createPool(e) {
    e.preventDefault()
    setErrorMsg('')
    const name = newName.trim()
    if (!name) return
    try {
      const { error } = await supabase
        .from('role_pools')
        .insert({ role_key: newRole, name })
      if (error) throw error
      setNewName('')
      setNewRole('script_editor')
      await loadAll()
    } catch (e) {
      setErrorMsg(e.message || 'Failed to create pool')
    }
  }

  // Rename pool
  async function saveRename() {
    if (!selPoolId) return
    const val = renameValue.trim()
    if (!val) return
    setErrorMsg('')
    try {
      const { error } = await supabase
        .from('role_pools')
        .update({ name: val })
        .eq('id', selPoolId)
      if (error) throw error

      setPools(prev => prev.map(p => p.id === selPoolId ? { ...p, name: val } : p))
      setRenaming(false)
    } catch (e) {
      setErrorMsg(e.message || 'Failed to rename pool')
    }
  }

  // Delete pool
  async function deletePool() {
    if (!selPoolId) return
    if (!window.confirm('Delete this pool? Members will simply lose this pool association (no user accounts are deleted).')) return
    setErrorMsg('')
    try {
      // Remove members first (in case of FK constraints)
      await supabase.from('role_pool_members').delete().eq('pool_id', selPoolId)
      const { error } = await supabase.from('role_pools').delete().eq('id', selPoolId)
      if (error) throw error

      // Refresh
      const nextPools = pools.filter(p => p.id !== selPoolId)
      setPools(nextPools)
      setSelPoolId(nextPools[0]?.id || null)
      setMembers([])
    } catch (e) {
      setErrorMsg(e.message || 'Failed to delete pool')
    }
  }

  // Add/remove member
  async function addMember(userId) {
    if (!selPoolId) return
    if (memberIds.has(userId)) return // guard
    setErrorMsg('')
    const optimistic = [...members, { user_id: userId }]
    setMembers(optimistic)
    const { error } = await supabase
      .from('role_pool_members')
      .insert({ pool_id: selPoolId, user_id: userId })
    if (error) {
      setMembers(members) // revert
      setErrorMsg(error.message)
    }
  }
  async function removeMember(userId) {
    if (!selPoolId) return
    if (!memberIds.has(userId)) return
    setErrorMsg('')
    const optimistic = members.filter(m => m.user_id !== userId)
    setMembers(optimistic)
    const { error } = await supabase
      .from('role_pool_members')
      .delete()
      .eq('pool_id', selPoolId)
      .eq('user_id', userId)
    if (error) {
      setMembers(members) // revert
      setErrorMsg(error.message)
    }
  }

  // Derived lists with search
  const currentPool = pools.find(p => p.id === selPoolId) || null
  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = people
    if (!q) return base
    return base.filter(p => {
      const s = `${p.name || ''} ${p.email || ''} ${p.role || ''}`.toLowerCase()
      return s.includes(q)
    })
  }, [people, search])

  const currentMembers = filteredPeople.filter(p => memberIds.has(p.id))
  const addablePeople  = filteredPeople.filter(p => !memberIds.has(p.id))

  if (!isExec) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b132b] text-gray-200">
        You don’t have access.
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b132b] text-gray-200">
      <header className="bg-[#1c2541] text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Role Pools</h1>
          <a href="/dashboard" className="text-sm text-[#6fffe9] hover:underline">← Back</a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {errorMsg && (
          <div className="rounded border border-red-700 bg-red-900/60 text-red-100 px-3 py-2">
            {errorMsg}
          </div>
        )}

        {/* Create pool */}
        <section className="rounded-lg bg-[#1c2541] border border-gray-700 p-4">
          <h2 className="font-semibold text-white mb-4">Create Pool</h2>
          <form onSubmit={createPool} className="grid sm:grid-cols-4 gap-3">
            <select
              className="rounded border border-gray-700 bg-[#0b132b] text-gray-100 px-3 py-2"
              value={newRole}
              onChange={(e)=>setNewRole(e.target.value)}
            >
              {ROLE_KEYS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <input
              className="sm:col-span-2 rounded border border-gray-700 bg-[#0b132b] text-gray-100 px-3 py-2"
              placeholder="Pool name (e.g., Script Editors)"
              value={newName}
              onChange={(e)=>setNewName(e.target.value)}
            />
            <button className="rounded bg-[#5bc0be] text-black hover:bg-[#6fffe9] px-3 py-2">
              Create
            </button>
          </form>
        </section>

        {/* Pools list + search and actions */}
        <section className="rounded-lg bg-[#1c2541] border border-gray-700 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">Pools</span>
              <span className="text-xs text-gray-400">({pools.length})</span>
            </div>
            <div className="flex items-center gap-2">
              {!!currentPool && !renaming && (
                <>
                  <button
                    className="px-3 py-1.5 rounded bg-[#3a506b] hover:bg-[#5bc0be] text-white text-sm"
                    onClick={() => { setRenaming(true); setRenameValue(currentPool.name) }}
                  >
                    Rename
                  </button>
                  <button
                    className="px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white text-sm"
                    onClick={deletePool}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            {/* Pools sidebar */}
            <div className="rounded border border-gray-700 overflow-hidden">
              {loading ? (
                <div className="p-3 text-sm text-gray-400">Loading…</div>
              ) : pools.length === 0 ? (
                <div className="p-3 text-sm text-gray-400">No pools yet.</div>
              ) : (
                <ul className="divide-y divide-gray-800">
                  {pools.map(pl => {
                    const selected = pl.id === selPoolId
                    const count = members && selPoolId === pl.id ? memberIds.size : null
                    return (
                      <li
                        key={pl.id}
                        className={`px-3 py-2 cursor-pointer ${selected ? 'bg-[#0b132b]' : 'hover:bg-[#0f1a33]'}`}
                        onClick={() => { setSelPoolId(pl.id); setRenaming(false) }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-white">{pl.name}</div>
                            <div className="text-xs text-gray-400">{roleLabel(pl.role_key)}</div>
                          </div>
                          {selected && (
                            <span className="text-xs text-gray-400">
                              {count !== null ? `${count} member${count === 1 ? '' : 's'}` : ''}
                            </span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Rename + Search */}
            <div className="space-y-3">
              <div className="rounded border border-gray-700 p-3">
                <div className="text-sm text-gray-300 mb-2">Selected Pool</div>
                {currentPool ? (
                  <>
                    {!renaming ? (
                      <div className="text-white">
                        <div className="font-medium">{currentPool.name}</div>
                        <div className="text-xs text-gray-400">{roleLabel(currentPool.role_key)}</div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          className="flex-1 rounded border border-gray-700 bg-[#0b132b] text-gray-100 px-3 py-2 text-sm"
                          value={renameValue}
                          onChange={(e)=>setRenameValue(e.target.value)}
                          placeholder="New pool name"
                        />
                        <button className="px-3 py-1.5 rounded bg-[#3a506b] hover:bg-[#5bc0be] text-white text-sm" onClick={saveRename}>
                          Save
                        </button>
                        <button className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm" onClick={()=>setRenaming(false)}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-gray-400">Create a pool to begin.</div>
                )}
              </div>

              <div className="rounded border border-gray-700 p-3">
                <div className="text-sm text-gray-300 mb-2">Search People</div>
                <input
                  className="w-full rounded border border-gray-700 bg-[#0b132b] text-gray-100 px-3 py-2 text-sm"
                  placeholder="Search by name, email, or role…"
                  value={search}
                  onChange={(e)=>setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Members and Add People */}
            <div className="space-y-4">
              <div className="rounded border border-gray-700">
                <div className="px-3 py-2 border-b border-gray-800 text-sm text-gray-300">
                  Members {currentPool ? `· ${currentPool.name}` : ''}
                </div>
                <div className="max-h-[300px] overflow-auto">
                  {currentPool ? (
                    currentMembers.length ? currentMembers.map(p => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-2 border-b border-gray-800 last:border-0">
                        <div className="min-w-0">
                          <div className="text-sm text-white truncate">{p.name || p.email}</div>
                          <div className="text-xs text-gray-400">{p.role}</div>
                        </div>
                        <button
                          onClick={()=>removeMember(p.id)}
                          className="text-xs px-2 py-1 rounded bg-red-700 hover:bg-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    )) : (
                      <div className="px-3 py-2 text-sm text-gray-400">No members in this pool.</div>
                    )
                  ) : (
                    <div className="px-3 py-2 text-sm text-gray-400">Select a pool.</div>
                  )}
                </div>
              </div>

              <div className="rounded border border-gray-700">
                <div className="px-3 py-2 border-b border-gray-800 text-sm text-gray-300">
                  Add People {currentPool ? `· ${currentPool.name}` : ''}
                </div>
                <div className="max-h-[300px] overflow-auto">
                  {currentPool ? (
                    addablePeople.length ? addablePeople.map(p => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-2 border-b border-gray-800 last:border-0">
                        <div className="min-w-0">
                          <div className="text-sm text-white truncate">{p.name || p.email}</div>
                          <div className="text-xs text-gray-400">{p.role}</div>
                        </div>
                        <button
                          onClick={()=>addMember(p.id)}
                          className="text-xs px-2 py-1 rounded bg-[#3a506b] hover:bg-[#5bc0be]"
                        >
                          Add
                        </button>
                      </div>
                    )) : (
                      <div className="px-3 py-2 text-sm text-gray-400">No matching people.</div>
                    )
                  ) : (
                    <div className="px-3 py-2 text-sm text-gray-400">Select a pool.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}