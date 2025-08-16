// pages/my-tasks.js
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../supabase/client'

const STATUS_COLORS = {
  'Not Started': 'bg-gray-700 text-gray-200',
  'In Progress': 'bg-blue-700 text-blue-100',
  'Under Review': 'bg-amber-700 text-amber-100',
  'Complete': 'bg-green-700 text-green-100'
}
const PHASE_LABEL = { pre: 'Pre-Production', prod: 'Production', post: 'Post-Production', publish: 'Publishing' }

export default function MyTasks() {
  const router = useRouter()
  const [me, setMe] = useState(null)
  const [profile, setProfile] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const canEditDates = useMemo(() => ['executive','associate'].includes(profile?.role), [profile])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setMe(user)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof || null)
      setLoading(false)
    })()
  }, [router])

  useEffect(() => {
    (async () => {
      if (!me) return
      // Join steps + segments
      const { data, error } = await supabase
        .from('steps')
        .select('id, name, phase, due_date, status, assigned_to, segment_id, segments!inner(id, title)')
        .eq('assigned_to', me.id)
        .order('due_date', { ascending: true })
      if (!error) setRows(data || [])
    })()
  }, [me])

  async function updateStep(stepId, patch) {
    const { error } = await supabase.from('steps').update(patch).eq('id', stepId)
    if (error) { alert(error.message || 'Update failed'); return }
    setRows(prev => prev.map(r => r.id === stepId ? { ...r, ...patch } : r))
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0b132b] text-gray-200">Loading…</div>
  }

  // Group: phase -> segment -> steps
  const grouped = rows.reduce((acc, r) => {
    const ph = r.phase || 'pre'
    const segId = r.segment_id
    const segTitle = r.segments?.title || `Segment ${segId}`
    acc[ph] ||= {}
    acc[ph][segId] ||= { title: segTitle, items: [] }
    acc[ph][segId].items.push(r)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-[#0b132b] text-gray-200">
      <header className="bg-[#1c2541] text-white shadow">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">My Tasks</h1>
          <div className="flex gap-2">
            <a href="/dashboard" className="px-3 py-2 rounded bg-[#3a506b] hover:bg-[#5bc0be] text-sm">Dashboard</a>
            <button
              onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
              className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {Object.keys(grouped).length === 0 ? (
          <div className="rounded-lg bg-[#1c2541] shadow p-6">Nothing assigned yet.</div>
        ) : (
          Object.entries(grouped).map(([phase, segs]) => (
            <section key={phase} className="space-y-3">
              <h2 className="text-lg font-semibold text-white">{PHASE_LABEL[phase] || phase}</h2>
              <div className="rounded-lg bg-[#1c2541] shadow divide-y divide-gray-700">
                {Object.entries(segs).map(([segId, s]) => (
                  <div key={segId} className="p-4">
                    <div className="flex items-center justify-between">
                      <a href={`/segments/${segId}`} className="text-white font-semibold hover:underline">{s.title}</a>
                      <a href={`/segments/${segId}`} className="text-xs text-[#6fffe9] hover:underline">Open</a>
                    </div>
                    <div className="mt-2 space-y-2">
                      {s.items.map(item => (
                        <div key={item.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm text-white">{item.name}</div>
                            <div className="text-xs text-gray-400">Due: {item.due_date ? new Date(item.due_date).toLocaleDateString() : 'Not set'}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <select
                              className="text-sm rounded border border-gray-600 bg-[#0b132b] text-gray-200 px-2 py-1"
                              value={item.status || 'Not Started'}
                              onChange={(e)=>updateStep(item.id, { status: e.target.value })}
                            >
                              <option>Not Started</option>
                              <option>In Progress</option>
                              <option>Under Review</option>
                              <option>Complete</option>
                            </select>
                            {canEditDates && (
                              <input
                                type="date"
                                className="text-sm rounded border border-gray-600 bg-[#0b132b] text-gray-200 px-2 py-1"
                                value={item.due_date || ''}
                                onChange={(e)=>updateStep(item.id, { due_date: e.target.value })}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  )
}
