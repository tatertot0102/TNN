// pages/admin/pools.js
import { useEffect, useMemo, useState } from 'react'
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

export default function PoolsAdmin() {
  const router = useRouter()
  const [me, setMe] = useState(null)
  const [profile, setProfile] = useState(null)

  const [pools, setPools] = useState([])
  const [people, setPeople] = useState([])
  const [selPool, setSelPool] = useState(null)

  const [newRole, setNewRole] = useState('script_editor')
  const [newName, setNewName] = useState('')

  const isExec = useMemo(() => profile?.role === 'executive' || profile?.role === 'associate', [profile])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setMe(user)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof || null)
    })()
  }, [router])

  useEffect(() => { if (isExec) loadAll() }, [isExec])

  async function loadAll() {
    const [{ data: pls }, { data: ppl }] = await Promise.all([
      supabase.from('role_pools').select('id, name, role_key').order('name', { ascending: true }),
      supabase.from('profiles').select('id, name, email, role').order('name', { ascending: true })
    ])
    setPools(pls || [])
    setPeople(ppl || [])
    if (pls?.length && !selPool) setSelPool(pls[0].id)
  }

  async function createPool(e) {
    e.preventDefault()
    if (!newName.trim()) return
    const { error } = await supabase.from('role_pools').insert({ role_key: newRole, name: newName.trim() })
    if (error) return alert(error.message)
    setNewName('')
    await loadAll()
  }

  async function addMember(userId) {
    if (!selPool) return
    const { error } = await supabase.from('role_pool_members').insert({ pool_id: selPool, user_id: userId })
    if (error) return alert(error.message)
    await loadMembers()
  }

  async function removeMember(userId) {
    if (!selPool) return
    const { error } = await supabase.from('role_pool_members').delete().eq('pool_id', selPool).eq('user_id', userId)
    if (error) return alert(error.message)
    await loadMembers()
  }

  const [members, setMembers] = useState([])
  useEffect(() => { if (selPool) loadMembers() }, [selPool])
  async function loadMembers() {
    if (!selPool) return
    const { data: m } = await supabase.from('role_pool_members').select('user_id').eq('pool_id', selPool)
    setMembers(m || [])
  }

  if (!isExec) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0b132b] text-gray-200">You don’t have access.</div>
  }

  const currentPool = pools.find(p => p.id === selPool)
  const memberIds = new Set(members.map(m => m.user_id))

  return (
    <div className="min-h-screen bg-[#0b132b] text-gray-200">
      <header className="bg-[#1c2541] text-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Role Pools</h1>
          <a href="/dashboard" className="text-sm text-[#6fffe9] hover:underline">← Back</a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Create pool */}
        <section className="rounded-lg bg-[#1c2541] border border-gray-700 p-4">
          <h2 className="font-semibold text-white mb-3">Create Pool</h2>
          <form onSubmit={createPool} className="grid sm:grid-cols-3 gap-3">
            <select className="rounded border border-gray-700 bg-[#0b132b] text-gray-100 px-3 py-2"
                    value={newRole} onChange={(e)=>setNewRole(e.target.value)}>
              {ROLE_KEYS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <input className="rounded border border-gray-700 bg-[#0b132b] text-gray-100 px-3 py-2"
                   placeholder="Pool name (e.g., Script Editors)"
                   value={newName} onChange={(e)=>setNewName(e.target.value)} />
            <button className="rounded bg-[#5bc0be] text-black hover:bg-[#6fffe9] px-3 py-2">Create</button>
          </form>
        </section>

        {/* Manage members */}
        <section className="rounded-lg bg-[#1c2541] border border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-white">Manage Members</h2>
            <select className="rounded border border-gray-700 bg-[#0b132b] text-gray-100 px-3 py-2"
                    value={selPool || ''} onChange={(e)=>setSelPool(Number(e.target.value))}>
              {pools.map(pl => <option key={pl.id} value={pl.id}>{pl.name} · {pl.role_key}</option>)}
            </select>
          </div>

          {currentPool ? (
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm text-gray-300 mb-1">Members</h3>
                <div className="rounded border border-gray-700">
                  {(people.filter(p => memberIds.has(p.id))).map(p => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 border-b border-gray-800 last:border-0">
                      <div className="text-sm">{p.name || p.email} <span className="text-xs text-gray-400">({p.role})</span></div>
                      <button onClick={()=>removeMember(p.id)} className="text-xs px-2 py-1 rounded bg-red-700 hover:bg-red-600">Remove</button>
                    </div>
                  ))}
                  {Array.from(memberIds).length === 0 && <div className="px-3 py-2 text-sm text-gray-400">No members yet.</div>}
                </div>
              </div>
              <div>
                <h3 className="text-sm text-gray-300 mb-1">Add People</h3>
                <div className="rounded border border-gray-700 overflow-hidden">
                  {(people.filter(p => !memberIds.has(p.id))).map(p => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 border-b border-gray-800 last:border-0">
                      <div className="text-sm">{p.name || p.email} <span className="text-xs text-gray-400">({p.role})</span></div>
                      <button onClick={()=>addMember(p.id)} className="text-xs px-2 py-1 rounded bg-[#3a506b] hover:bg-[#5bc0be]">Add</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400">Create a pool above, then add members.</div>
          )}
        </section>
      </main>
    </div>
  )
}
